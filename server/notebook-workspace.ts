import { MAX_NOTEBOOK_SOURCES } from "../shared/notebook-limits.ts";
import { createReadStream } from "node:fs";
import { mkdir, stat, open, lstat } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import {
  db,
  dataDir,
  getNotebook,
  newNotebook,
  originalsDir,
  saveNotebook,
} from "./store.ts";
import { withArtifactMutation } from "./artifact-lock.ts";
import { invalidateVaultIndex } from "./vault-index.ts";
import {
  connectVault,
  createVaultFolder,
  getVault,
  checkedVaultPath,
  readVaultNote,
  saveVaultNote,
  scanVault,
} from "./vault.ts";
import { verifyOriginal } from "./source-originals.ts";
import { uid, type Notebook, type Source } from "../shared/model.ts";
import type {
  NotebookWorkspaceLink,
  WorkspaceSyncResult,
  WorkspaceWarning,
} from "../shared/notebook-workspace.ts";

const MAX_NOTES = MAX_NOTEBOOK_SOURCES;
const MAX_SYNC_BYTES = 100 * 1024 * 1024;
const MAX_EXPORT_BYTES = 512 * 1024 * 1024;
const MAX_WARNINGS = 50;

db.exec(`CREATE TABLE IF NOT EXISTS notebook_workspace_links (
  notebook_id TEXT PRIMARY KEY REFERENCES notebooks(id) ON DELETE CASCADE,
  vault_id TEXT NOT NULL UNIQUE REFERENCES vaults(id),
  managed INTEGER NOT NULL CHECK (managed IN (0,1)),
  created_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS notebook_workspace_exclusions (
  notebook_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (notebook_id, path)
)`);

function warning(message: string, pathName?: string): WorkspaceWarning {
  return pathName ? { path: pathName, message } : { message };
}
function boundedWarnings(items: WorkspaceWarning[]) {
  return items.slice(0, MAX_WARNINGS);
}
function slug(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "note"
  );
}
function sourcePath(title: string, id: string, occupied: Set<string>) {
  let name =
    title
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 100) || "Note";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    name = "Note " + name;
  const plain = `Notes/${name}.md`;
  if (!occupied.has(plain.toLowerCase())) return plain;
  return `Notes/${name} ${id.slice(0, 8)}.md`;
}
function linkFromRow(row: {
  notebook_id: string;
  vault_id: string;
  managed: number;
  root: string;
}): NotebookWorkspaceLink {
  return {
    notebookId: row.notebook_id,
    vaultId: row.vault_id,
    managed: row.managed !== 0,
    root: row.root,
  };
}
function findByNotebook(notebookId: string): NotebookWorkspaceLink | undefined {
  const row = db
    .prepare(
      `SELECT l.notebook_id,l.vault_id,l.managed,v.root FROM notebook_workspace_links l JOIN vaults v ON v.id=l.vault_id WHERE l.notebook_id=?`,
    )
    .get(notebookId) as
    | { notebook_id: string; vault_id: string; managed: number; root: string }
    | undefined;
  return row && linkFromRow(row);
}
function findByVault(vaultId: string): NotebookWorkspaceLink | undefined {
  const row = db
    .prepare(
      `SELECT l.notebook_id,l.vault_id,l.managed,v.root FROM notebook_workspace_links l JOIN vaults v ON v.id=l.vault_id WHERE l.vault_id=?`,
    )
    .get(vaultId) as
    | { notebook_id: string; vault_id: string; managed: number; root: string }
    | undefined;
  return row && linkFromRow(row);
}
function insertLink(notebookId: string, vaultId: string, managed: boolean) {
  const vault = getVault(vaultId);
  db.prepare(
    "INSERT INTO notebook_workspace_links(notebook_id,vault_id,managed,created_at) VALUES(?,?,?,?)",
  ).run(notebookId, vaultId, managed ? 1 : 0, new Date().toISOString());
  return {
    notebookId,
    vaultId,
    managed,
    root: vault.root,
  } satisfies NotebookWorkspaceLink;
}

const preparing = new Map<string, Promise<NotebookWorkspaceLink>>();
/** Create or return the workspace paired with a notebook. Concurrent opens share one seed. */
export function ensureNotebookWorkspace(
  notebookId: string,
): Promise<NotebookWorkspaceLink> {
  const existing = preparing.get(notebookId);
  if (existing) return existing;
  const task = prepareNotebookWorkspace(notebookId).finally(() => {
    if (preparing.get(notebookId) === task) preparing.delete(notebookId);
  });
  preparing.set(notebookId, task);
  return task;
}
async function prepareNotebookWorkspace(
  notebookId: string,
): Promise<NotebookWorkspaceLink> {
  getNotebook(notebookId);
  const known = findByNotebook(notebookId);
  if (known) {
    if (known.managed)
      db.prepare("UPDATE vaults SET name=? WHERE id=?").run(
        getNotebook(notebookId).title,
        known.vaultId,
      );
    const seeded = await seedSources(getNotebook(notebookId), known);
    return seeded.warnings.length
      ? { ...known, warnings: seeded.warnings }
      : known;
  }
  const root = path.join(dataDir, "workspaces", notebookId);
  await mkdir(root, { recursive: true });
  const vault = await connectVault(root);
  const existing = findByNotebook(notebookId) || findByVault(vault.id);
  if (existing) return existing;
  const link = await withArtifactMutation(() => {
    const again = findByNotebook(notebookId) || findByVault(vault.id);
    if (again) return again;
    db.prepare("UPDATE vaults SET name=? WHERE id=?").run(
      getNotebook(notebookId).title,
      vault.id,
    );
    return insertLink(notebookId, vault.id, true);
  });
  // saveVaultNote/createVaultFolder acquire the same process-wide lock. Keep
  // seeding outside this critical section to avoid a nested-lock deadlock.
  const seeded = await seedSources(getNotebook(notebookId), link);
  if (seeded.warnings.length) return { ...link, warnings: seeded.warnings };
  return link;
}

async function seedSources(notebook: Notebook, link: NotebookWorkspaceLink) {
  const warnings: WorkspaceWarning[] = [];
  const candidates = notebook.sources.filter(
    (source) =>
      source.vault?.vaultId !== link.vaultId &&
      source.text.trim().length > 0 &&
      !source.processing,
  );
  if (!candidates.length) return { warnings };
  const seeded = new Map<
    string,
    { text: string; relative: string; revision: string }
  >();
  await createVaultFolder(link.vaultId, "Notes").catch(() => undefined);
  const existing = await scanVault(link.vaultId);
  const names = new Set(existing.files.map((f) => f.path.toLowerCase()));
  for (const source of candidates.slice(0, MAX_NOTES)) {
    const relative = sourcePath(source.title, source.id, names);
    if (names.has(relative.toLowerCase())) {
      warnings.push(
        warning(
          "A Markdown file already uses this source's stable name and was preserved.",
          relative,
        ),
      );
      continue;
    }
    try {
      const saved = await saveVaultNote(
        link.vaultId,
        relative,
        source.text,
        null,
      );
      seeded.set(source.id, {
        text: source.text,
        relative,
        revision: saved.revision,
      });
      names.add(relative.toLowerCase());
    } catch (error) {
      warnings.push(
        warning(
          error instanceof Error
            ? error.message
            : "Could not seed this source.",
          relative,
        ),
      );
    }
  }
  // Persist provenance on the original source IDs. This prevents the initial
  // seed from being re-imported as a second source during the first sync.
  if (seeded.size) {
    invalidateVaultIndex(link.vaultId);
    await withArtifactMutation(() => {
      const latest = getNotebook(notebook.id);
      let changed = false;
      for (const source of latest.sources) {
        const record = seeded.get(source.id);
        if (!record || source.vault?.vaultId === link.vaultId) continue;
        if (source.vault && !source.vaultOrigin)
          source.vaultOrigin = { ...source.vault };
        source.filename = record.relative;
        source.vault = {
          vaultId: link.vaultId,
          vaultName: getVault(link.vaultId).name,
          path: record.relative,
          revision: record.revision,
          importedAt: new Date().toISOString(),
        };
        changed = true;
      }
      if (changed) saveNotebook(latest);
    });
  }
  return { warnings: boundedWarnings(warnings) };
}

/** Pair an already-connected vault with one notebook, idempotently. */
export async function notebookForVault(
  vaultId: string,
): Promise<NotebookWorkspaceLink> {
  const vault = getVault(vaultId);
  const known = findByVault(vaultId);
  if (known) return known;
  const notebook = newNotebook(vault.name);
  return withArtifactMutation(() => {
    const again = findByVault(vaultId);
    if (again) return again;
    saveNotebook(notebook);
    return insertLink(notebook.id, vault.id, false);
  });
}

export function listWorkspaceLinks(): NotebookWorkspaceLink[] {
  return (
    db
      .prepare(
        `SELECT l.notebook_id,l.vault_id,l.managed,v.root FROM notebook_workspace_links l JOIN vaults v ON v.id=l.vault_id ORDER BY l.created_at`,
      )
      .all() as {
      notebook_id: string;
      vault_id: string;
      managed: number;
      root: string;
    }[]
  ).map(linkFromRow);
}

/** Remember that a learner removed a source from LMBook; the vault file stays intact. */
export function excludeWorkspaceSource(notebookId: string, sourceId: string) {
  const link = findByNotebook(notebookId);
  if (!link) return { excluded: false as const };
  const notebook = getNotebook(notebookId);
  const source = notebook.sources.find((item) => item.id === sourceId);
  if (!source?.vault || source.vault.vaultId !== link.vaultId)
    return { excluded: false as const };
  db.prepare(
    "INSERT OR IGNORE INTO notebook_workspace_exclusions(notebook_id,path,created_at) VALUES(?,?,?)",
  ).run(notebookId, source.vault.path, new Date().toISOString());
  return { excluded: true as const, path: source.vault.path };
}

/** Import current Markdown text without deleting sources or historical evidence. */
export async function syncNotebookWorkspace(
  notebookId: string,
): Promise<WorkspaceSyncResult> {
  const link = await ensureNotebookWorkspace(notebookId);
  const before = getNotebook(notebookId);
  const beforeByPath = new Map(
    before.sources.flatMap((source) =>
      source.vault?.vaultId === link.vaultId
        ? [
            [
              source.vault.path,
              {
                text: source.text,
                id: source.id,
                revision: source.vault.revision,
              },
            ] as const,
          ]
        : [],
    ),
  );
  let excluded = new Set(
    (
      db
        .prepare(
          "SELECT path FROM notebook_workspace_exclusions WHERE notebook_id=?",
        )
        .all(notebookId) as { path: string }[]
    ).map((row) => row.path),
  );
  const index = await scanVault(link.vaultId);
  const notes = index.files.slice(0, MAX_NOTES);
  const warnings: WorkspaceWarning[] = [];
  const linkWarnings = link.warnings || [];
  warnings.push(...linkWarnings);
  if (index.files.length > MAX_NOTES)
    warnings.push(warning(`Only the first ${MAX_NOTES} notes were imported.`));
  const readNotes: Array<{ path: string; text: string; revision: string }> = [];
  let imported = 0,
    updated = 0,
    unchanged = 0,
    totalBytes = 0,
    preservedRemoved = 0;
  let completeScan =
    index.warnings.length === 0 && index.files.length <= MAX_NOTES;
  for (const file of notes) {
    try {
      const read = await readVaultNote(link.vaultId, file.path);
      totalBytes += Buffer.byteLength(read.note.text);
      if (totalBytes > MAX_SYNC_BYTES) {
        warnings.push(
          warning(
            "Sync stopped at the 100 MB safety limit; absent-note detection was skipped.",
            file.path,
          ),
        );
        completeScan = false;
        break;
      }
      readNotes.push({
        path: file.path,
        text: read.note.text,
        revision: read.note.revision,
      });
    } catch (error) {
      warnings.push(
        warning(
          error instanceof Error ? error.message : "Could not read this note.",
          file.path,
        ),
      );
    }
  }
  // Vault reads can take a while. Re-load only after they finish, then merge
  // the affected source records so chat, goals, and concurrent edits survive.
  await withArtifactMutation(() => {
    const notebook = getNotebook(notebookId);
    excluded = new Set(
      (
        db
          .prepare(
            "SELECT path FROM notebook_workspace_exclusions WHERE notebook_id=?",
          )
          .all(notebookId) as { path: string }[]
      ).map((row) => row.path),
    );
    const byPath = new Map(
      notebook.sources.flatMap((source) =>
        source.vault?.vaultId === link.vaultId && source.vault.path
          ? [[source.vault.path, source] as const]
          : [],
      ),
    );
    for (const read of readNotes) {
      const prior = byPath.get(read.path);
      if (!prior && excluded.has(read.path)) continue;
      if (prior) {
        const initial = beforeByPath.get(read.path);
        if (initial && initial.id === prior.id && initial.text !== prior.text) {
          const vaultChanged = initial.revision !== read.revision;
          warnings.push(
            warning(
              vaultChanged
                ? "LMBook and the vault changed this source during sync; the newer LMBook source text was preserved. Review the vault note before accepting it."
                : "The source was edited in LMBook while this vault read was in progress; the newer source text was preserved.",
              read.path,
            ),
          );
          continue;
        }
        if (
          prior.vault?.revision === read.revision &&
          prior.text !== read.text
        ) {
          unchanged++;
          continue;
        }
        if (
          prior.text === read.text &&
          prior.vault?.revision === read.revision
        ) {
          unchanged++;
          continue;
        }
        prior.text = read.text;
        prior.filename = read.path;
        prior.vault = {
          vaultId: link.vaultId,
          vaultName: getVault(link.vaultId).name,
          path: read.path,
          revision: read.revision,
          importedAt: new Date().toISOString(),
        };
        updated++;
      } else {
        if (notebook.sources.length >= MAX_NOTEBOOK_SOURCES) {
          warnings.push(
            warning(
              "This notebook reached the 2,000-source limit. The remaining files are still available in the note browser.",
              read.path,
            ),
          );
          continue;
        }
        notebook.sources.push({
          id: uid(),
          title: path.basename(read.path, path.extname(read.path)),
          text: read.text,
          kind: "supplement",
          filename: read.path,
          createdAt: new Date().toISOString(),
          vault: {
            vaultId: link.vaultId,
            vaultName: getVault(link.vaultId).name,
            path: read.path,
            revision: read.revision,
            importedAt: new Date().toISOString(),
          },
        });
        imported++;
      }
    }
    const present = new Set(index.files.map((note) => note.path));
    if (completeScan)
      for (const source of notebook.sources)
        if (
          source.vault?.vaultId === link.vaultId &&
          !present.has(source.vault.path)
        ) {
          preservedRemoved++;
          warnings.push(
            warning(
              "The file is absent; its notebook source was preserved.",
              source.vault.path,
            ),
          );
        }
    if (imported || updated) saveNotebook(notebook);
  });
  return {
    notebookId,
    imported,
    updated,
    unchanged,
    preservedRemoved,
    excluded: excluded.size,
    warnings: boundedWarnings(warnings),
  };
}

function markdownNotebook(notebook: Notebook) {
  const lines = [
    `# ${notebook.title}`,
    "",
    notebook.description,
    "",
    "## Learning goals",
    ...notebook.objectives.map((o) => `- ${o.text}`),
    "",
    "## Sources",
    ...notebook.sources.map(
      (s) =>
        `- [[${s.filename || `Notes/${slug(s.title)}-${s.id}.md`}]] — ${s.title}`,
    ),
  ];
  return lines.join("\n");
}

/** Export attachments as bytes; preview MIME restrictions do not apply to downloads. */
async function readExportAttachment(
  vaultId: string,
  relative: string,
  remaining: number,
) {
  const vault = getVault(vaultId);
  const handle = await open(await checkedVaultPath(vault, relative), "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > remaining)
      throw new Error(`Export exceeds its 512 MB limit at ${relative}.`);
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!read.bytesRead)
        throw new Error(
          `Attachment changed during export: ${relative}. Retry the export.`,
        );
      offset += read.bytesRead;
    }
    const current = await lstat(await checkedVaultPath(vault, relative));
    if (
      current.ino !== info.ino ||
      current.dev !== info.dev ||
      current.size !== info.size ||
      current.mtimeMs !== info.mtimeMs
    )
      throw new Error(
        `Attachment changed during export: ${relative}. Retry the export.`,
      );
    return { bytes };
  } finally {
    await handle.close();
  }
}

/** Build a safe Obsidian-compatible ZIP. The returned stream is finalized asynchronously. */
export async function createObsidianNotebookExport(
  notebookId: string,
): Promise<PassThrough> {
  const link = await ensureNotebookWorkspace(notebookId);
  const notebook = getNotebook(notebookId);
  const index = await scanVault(link.vaultId);
  if (index.warnings.length)
    throw new Error(
      `The vault could not be exported completely: ${index.warnings.join(" ")}`,
    );
  if (index.files.length > MAX_NOTES)
    throw new Error(
      `Export cannot include more than ${MAX_NOTES} Markdown notes; narrow the vault first.`,
    );
  const metadata: Array<{ name: string; text: string }> = [
    {
      name: "export-manifest.json",
      text: JSON.stringify(
        {
          format: "lmbook-obsidian-export",
          version: 1,
          notebookId,
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    },
    { name: "notebook.json", text: JSON.stringify(notebook, null, 2) },
    { name: "Notebook.md", text: markdownNotebook(notebook) },
    {
      name: "Conversations.md",
      text:
        "# Conversations\n\n" +
        notebook.messages
          .map(
            (message) =>
              `## ${message.role === "user" ? "You" : "LMBook"}\n\n${message.text}`,
          )
          .join("\n\n"),
    },
    {
      name: "Audio scripts.md",
      text:
        "# Audio scripts\n\n" +
        notebook.episodes
          .map(
            (episode) =>
              `## ${episode.title}\n\n` +
              episode.chapters
                .map(
                  (chapter) =>
                    `### ${chapter.title}\n\n` +
                    chapter.turns
                      .map((turn) => `**${turn.speaker}:** ${turn.text}`)
                      .join("\n\n"),
                )
                .join("\n\n"),
          )
          .join("\n\n"),
    },
    {
      name: "Flashcards.md",
      text:
        "# Flashcards\n\n" +
        (notebook.flashcards || [])
          .map(
            (deck) =>
              `## ${deck.title}\n\n` +
              deck.cards
                .map((card) => `### ${card.front}\n\n${card.back}`)
                .join("\n\n"),
          )
          .join("\n\n"),
    },
    {
      name: "README.md",
      text: "# Open this folder in Obsidian\n\nExtract the ZIP, then choose Open folder as vault in Obsidian. Notes and supported attachments keep their relative paths. This folder contains readable learning material and LMBook data. Plugin code and app credentials are never included. Audio scripts are included; export recordings separately from Audio studio. Use an LMBook backup from Settings to restore the full app notebook, including generated audio.\n",
    },
  ];
  const metadataBytes = metadata.reduce(
    (total, item) => total + Buffer.byteLength(item.text),
    2,
  );
  if (metadataBytes > MAX_EXPORT_BYTES)
    throw new Error("Notebook metadata exceeds the 512 MB export limit.");
  const noteData: Array<{ path: string; text: string }> = [];
  const assetData: Array<{ path: string; bytes: Buffer }> = [];
  let plannedBytes = metadataBytes;
  for (const file of index.files) {
    const note = await readVaultNote(link.vaultId, file.path);
    plannedBytes += Buffer.byteLength(note.note.text);
    if (plannedBytes > MAX_EXPORT_BYTES)
      throw new Error(
        "Export exceeds the 512 MB safety limit before ZIP creation.",
      );
    noteData.push({ path: file.path, text: note.note.text });
  }
  for (const asset of index.assets) {
    const read = await readExportAttachment(
      link.vaultId,
      asset.path,
      MAX_EXPORT_BYTES - plannedBytes,
    );
    plannedBytes += read.bytes.length;
    if (plannedBytes > MAX_EXPORT_BYTES)
      throw new Error(
        "Export exceeds the 512 MB safety limit before ZIP creation.",
      );
    assetData.push({ path: asset.path, bytes: read.bytes });
  }
  const originalData: Array<{
    path: string;
    streamPath: string;
    bytes: number;
  }> = [];
  const originalHashes = new Set<string>();
  for (const source of notebook.sources)
    if (source.attachment && !originalHashes.has(source.attachment.sha256)) {
      originalHashes.add(source.attachment.sha256);
      const file = await verifyOriginal(originalsDir, source.attachment).catch(
        () => {
          throw new Error(
            `Export cannot safely read original attachment ${source.attachment!.filename}.`,
          );
        },
      );
      const info = await stat(file);
      plannedBytes += info.size;
      if (plannedBytes > MAX_EXPORT_BYTES)
        throw new Error(
          "Export exceeds the 512 MB safety limit before ZIP creation.",
        );
      originalData.push({
        path: `${source.attachment.sha256}-${path.basename(source.attachment.filename).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")}`,
        streamPath: file,
        bytes: info.size,
      });
    }
  const output = new PassThrough();
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on("error", (error: Error) => output.destroy(error));
  zip.pipe(output);
  const used = new Set(
    [...index.files, ...index.assets].map((item) => item.path.toLowerCase()),
  );
  let metadataRoot = "LMBook",
    suffix = 1;
  while (
    [...used].some(
      (name) =>
        name === metadataRoot.toLowerCase() ||
        name.startsWith(`${metadataRoot.toLowerCase()}/`),
    )
  )
    metadataRoot = `LMBook-export-${notebookId.slice(0, 8)}${suffix++ === 1 ? "" : `-${suffix - 1}`}`;
  for (const item of metadata)
    zip.append(item.text, { name: `${metadataRoot}/${item.name}` });
  zip.append("{}", { name: ".obsidian/app.json" });
  let bytes = 0;
  for (const file of noteData) {
    bytes += Buffer.byteLength(file.text);
    zip.append(file.text, { name: file.path });
  }
  for (const asset of assetData) {
    bytes += asset.bytes.length;
    zip.append(asset.bytes, { name: asset.path });
  }
  for (const original of originalData) {
    bytes += original.bytes;
    zip.append(createReadStream(original.streamPath), {
      name: `${metadataRoot}/originals/${original.path}`,
    });
  }
  output.on("close", () => {
    if (!output.readableEnded) zip.abort();
  });
  void zip.finalize().catch((error) => output.destroy(error));
  return output;
}
