import { setImmediate as yieldTurn } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { db } from "./store.ts";
import { getVault, readVaultNote, scanVault } from "./vault.ts";
import {
  inspectVaultMarkdown,
  createVaultLinkResolver,
} from "../shared/vault-markdown.ts";
import type { VaultLink, VaultHeading } from "../shared/vault-markdown.ts";
import type {
  VaultFile,
  VaultIndex,
  VaultIndexStatus,
  VaultSearchResult,
} from "../shared/vault.ts";

db.exec(`CREATE TABLE IF NOT EXISTS vault_index_notes (
  vault_id TEXT NOT NULL, path TEXT NOT NULL, modified REAL NOT NULL, bytes INTEGER NOT NULL,
  metadata TEXT NOT NULL, PRIMARY KEY(vault_id,path));
  CREATE VIRTUAL TABLE IF NOT EXISTS vault_index_search USING fts5(vault_id UNINDEXED,path,title,aliases,tags,body,tokenize='unicode61 remove_diacritics 2');
  CREATE TABLE IF NOT EXISTS vault_index_inventory (vault_id TEXT PRIMARY KEY, body TEXT NOT NULL);
  CREATE TEMP TABLE IF NOT EXISTS vault_index_staging (
    vault_id TEXT NOT NULL, run_id TEXT NOT NULL, path TEXT NOT NULL,
    modified REAL NOT NULL, bytes INTEGER NOT NULL, metadata TEXT NOT NULL,
    title TEXT NOT NULL, aliases TEXT NOT NULL, tags TEXT NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY(run_id,path));`);

type Metadata = VaultFile & { links?: VaultLink[]; headings?: VaultHeading[] };
type IndexState = {
  inventory: VaultIndex;
  task: Promise<void> | null;
  requestedAt: number;
  cancelled: boolean;
};
const states = new Map<string, IndexState>();
const MAX_INDEX_BYTES = 128 * 1024 * 1024;
const cloneIndex = (index: VaultIndex): VaultIndex => ({
  files: index.files.map((file) => ({ ...file })),
  folders: [...index.folders],
  assets: index.assets.map((asset) => ({ ...asset })),
  status: { ...index.status, warnings: [...index.status.warnings] },
});
const emptyStatus = (): VaultIndexStatus => ({
  running: false,
  completed: 0,
  total: 0,
  updatedAt: null,
  warnings: [],
});
function stateFor(id: string) {
  getVault(id);
  let state = states.get(id);
  if (!state) {
    const row = db
      .prepare("SELECT body FROM vault_index_inventory WHERE vault_id=?")
      .get(id) as { body: string } | undefined;
    let inventory: VaultIndex = {
      files: [],
      folders: [],
      assets: [],
      status: emptyStatus(),
    };
    if (row) {
      try {
        inventory = JSON.parse(row.body);
        inventory.status.running = false;
      } catch {
        /* An expendable index can always be rebuilt from the vault. */
      }
    }
    state = { inventory, task: null, requestedAt: 0, cancelled: false };
    states.set(id, state);
  }
  return state;
}

function stageMetadata(
  runId: string,
  id: string,
  meta: Metadata,
  body: string,
) {
  db.prepare(
    `INSERT INTO vault_index_staging
    (vault_id,run_id,path,modified,bytes,metadata,title,aliases,tags,body)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    runId,
    meta.path,
    meta.modified,
    meta.bytes,
    JSON.stringify(meta),
    meta.title || "",
    (meta.aliases || []).join(" "),
    (meta.tags || []).join(" "),
    body,
  );
}

async function rebuild(id: string, state: IndexState, verify: boolean) {
  const lastComplete = cloneIndex(state.inventory);
  const status: VaultIndexStatus = {
    ...lastComplete.status,
    running: true,
    completed: 0,
    total: 0,
    warnings: [],
  };
  state.inventory = { ...lastComplete, status };
  const runId = randomUUID();
  let candidate: VaultIndex | null = null;
  let committed = false;
  let changedDuringScan = false;
  try {
    // An earlier interrupted run in this process may have left abandoned
    // rows behind. They are never visible to readers, and can be discarded
    // before this run starts. TEMP storage also disappears on restart.
    db.prepare("DELETE FROM vault_index_staging WHERE vault_id=?").run(id);
    const scan = await scanVault(id);
    if (state.cancelled || states.get(id) !== state) return;

    // A partial scan must not replace an existing complete generation with an
    // incomplete one. On the first scan there is no complete generation yet,
    // so commit the discovered subset with an explicit warning instead of
    // pretending that the vault is empty.
    const partialFirstScan =
      scan.warnings.length > 0 && lastComplete.status.updatedAt === null;
    if (scan.warnings.length && !partialFirstScan) {
      state.inventory = {
        ...lastComplete,
        status: {
          ...lastComplete.status,
          running: false,
          warnings: [
            ...new Set([...lastComplete.status.warnings, ...scan.warnings]),
          ].slice(0, 10),
        },
      };
      return;
    }

    const cached = new Map<string, Metadata>();
    for (const row of db
      .prepare("SELECT path,metadata FROM vault_index_notes WHERE vault_id=?")
      .all(id) as { path: string; metadata: string }[]) {
      try {
        cached.set(row.path, JSON.parse(row.metadata) as Metadata);
      } catch {
        /* A malformed cache entry is re-read below. */
      }
    }
    // Do not issue a table-scanning body lookup for every cached note. The
    // path map is small, and each body is fetched through its FTS rowid.
    const cachedBodyRowIds = new Map<string, number>();
    for (const row of db
      .prepare("SELECT rowid,path FROM vault_index_search WHERE vault_id=?")
      .all(id) as { rowid: number; path: string }[])
      cachedBodyRowIds.set(row.path, row.rowid);
    const readCachedBody = db.prepare(
      "SELECT body FROM vault_index_search WHERE rowid=?",
    );
    status.total = scan.files.length;
    if (partialFirstScan) status.warnings = [...scan.warnings];
    candidate = {
      files: scan.files.map((file) => ({ ...file })),
      folders: scan.folders,
      assets: scan.assets,
      status,
    };
    let indexedBytes = 0;
    let skipped = 0;
    for (let i = 0; i < scan.files.length; i++) {
      if (state.cancelled || states.get(id) !== state) return;
      const file = scan.files[i];
      const old = cached.get(file.path);
      let meta: Metadata;
      if (
        file.bytes > 1024 * 1024 ||
        indexedBytes + file.bytes > MAX_INDEX_BYTES
      ) {
        meta = {
          ...file,
          issue:
            file.bytes > 1024 * 1024
              ? "Above the 1 MB reading and editing limit."
              : "Not indexed: the vault's 128 MB search budget is full. Filename search is still available.",
        };
        stageMetadata(runId, id, meta, "");
        skipped++;
      } else {
        indexedBytes += file.bytes;
        const cachedBodyRowId =
          old && !old.issue ? cachedBodyRowIds.get(file.path) : undefined;
        const cachedBody =
          cachedBodyRowId === undefined
            ? undefined
            : (readCachedBody.get(cachedBodyRowId) as
                { body: string } | undefined);
        if (
          !verify &&
          old &&
          !old.issue &&
          cachedBody &&
          old.modified === file.modified &&
          old.bytes === file.bytes
        ) {
          meta = old;
          stageMetadata(runId, id, meta, cachedBody.body);
        } else {
          try {
            const { note, bytes } = await readVaultNote(id, file.path);
            if (state.cancelled || states.get(id) !== state) return;
            if (note.modified !== file.modified || bytes.length !== file.bytes)
              changedDuringScan = true;
            if (
              bytes.length > 1024 * 1024 ||
              indexedBytes - file.bytes + bytes.length > MAX_INDEX_BYTES
            ) {
              meta = {
                ...file,
                bytes: bytes.length,
                modified: note.modified,
                issue:
                  bytes.length > 1024 * 1024
                    ? "Above the 1 MB reading and editing limit."
                    : "Not indexed: the vault's 128 MB search budget is full. Filename search is still available.",
              };
              stageMetadata(runId, id, meta, "");
              skipped++;
              indexedBytes -= file.bytes;
              await yieldTurn();
              if (state.cancelled || states.get(id) !== state) return;
              continue;
            }
            indexedBytes += bytes.length - file.bytes;
            const inspected = inspectVaultMarkdown(note.text);
            meta = {
              ...file,
              bytes: bytes.length,
              modified: note.modified,
              revision: note.revision,
              title: inspected.title,
              aliases: inspected.aliases,
              tags: inspected.tags,
              headings: inspected.headings,
              links: inspected.links,
            };
            stageMetadata(runId, id, meta, note.text);
          } catch (error) {
            if (state.cancelled || states.get(id) !== state) return;
            // The estimate was reserved before the read. Do not let a
            // failed/invalid note consume the budget for later notes.
            indexedBytes -= file.bytes;
            meta = {
              ...file,
              issue:
                error instanceof Error
                  ? error.message
                  : "This note could not be indexed.",
            };
            stageMetadata(runId, id, meta, "");
            skipped++;
          }
        }
      }
      // The renderer gets only navigation metadata, never all indexed note bodies.
      const { links: _links, headings: _headings, ...summary } = meta;
      candidate.files[i] = summary;
      status.completed++;
      await yieldTurn();
      if (state.cancelled || states.get(id) !== state) return;
    }
    if (skipped)
      status.warnings.push(
        `${skipped} ${skipped === 1 ? "note has" : "notes have"} a reading or search limitation. Each is still listed with its reason.`,
      );
    if (changedDuringScan)
      status.warnings.push(
        "Some notes changed while indexing. Refresh again to capture their latest contents.",
      );
    if (!partialFirstScan) status.updatedAt = new Date().toISOString();
    status.running = false;

    // No await occurs after the last cancellation check. The replacement is a
    // short SQLite transaction, so readers see either the previous complete
    // generation or this complete generation, never a mixed rebuild.
    if (state.cancelled || states.get(id) !== state) return;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM vault_index_notes WHERE vault_id=?").run(id);
      db.prepare("DELETE FROM vault_index_search WHERE vault_id=?").run(id);
      db.prepare(
        "INSERT INTO vault_index_notes(vault_id,path,modified,bytes,metadata) SELECT vault_id,path,modified,bytes,metadata FROM vault_index_staging WHERE vault_id=? AND run_id=?",
      ).run(id, runId);
      db.prepare(
        "INSERT INTO vault_index_search(vault_id,path,title,aliases,tags,body) SELECT vault_id,path,title,aliases,tags,body FROM vault_index_staging WHERE vault_id=? AND run_id=?",
      ).run(id, runId);
      db.prepare(
        "INSERT INTO vault_index_inventory(vault_id,body) VALUES(?,?) ON CONFLICT(vault_id) DO UPDATE SET body=excluded.body",
      ).run(id, JSON.stringify(candidate));
      db.prepare(
        "DELETE FROM vault_index_staging WHERE vault_id=? AND run_id=?",
      ).run(id, runId);
      db.exec("COMMIT");
      committed = true;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (committed) state.inventory = candidate;
  } catch (error) {
    if (states.get(id) === state)
      state.inventory = {
        ...lastComplete,
        status: {
          ...lastComplete.status,
          running: false,
          warnings: [
            error instanceof Error
              ? error.message
              : "The vault could not be indexed.",
          ],
        },
      };
  } finally {
    try {
      db.prepare(
        "DELETE FROM vault_index_staging WHERE vault_id=? AND run_id=?",
      ).run(id, runId);
    } catch {
      /* The live generation is already intact; cleanup can retry next run. */
    }
    if (states.get(id) === state) {
      if (state.cancelled && !committed) state.inventory = lastComplete;
      state.task = null;
    }
  }
}

export function getVaultIndex(id: string, refresh = false) {
  const state = stateFor(id);
  if (
    !state.cancelled &&
    !state.task &&
    (refresh || Date.now() - state.requestedAt > 30000)
  ) {
    state.requestedAt = Date.now();
    state.task = rebuild(id, state, refresh);
  }
  return state.inventory;
}
export function invalidateVaultIndex(id: string) {
  const state = states.get(id);
  if (state) state.requestedAt = 0;
}
export async function stopVaultIndex(id: string) {
  const state = states.get(id);
  if (!state) return;
  state.cancelled = true;
  const task = state.task;
  if (task) await task;
  // Keep the entry until the task's finally block has run. This prevents a
  // late finally from clearing or repopulating a newer state for the same id.
  if (states.get(id) === state) states.delete(id);
}

export function searchVault(
  id: string,
  query: string,
  limit = 100,
): { results: VaultSearchResult[]; more: boolean; status: VaultIndexStatus } {
  const state = stateFor(id);
  const term = query.trim().toLocaleLowerCase();
  if (!term)
    return { results: [], more: false, status: state.inventory.status };
  const tokens = term.match(/[\p{Letter}\p{Number}_]+/gu)?.slice(0, 16) || [];
  const matches = new Map<string, VaultSearchResult>();
  for (const file of state.inventory.files) {
    if (
      [file.path, ...(file.aliases || []), ...(file.tags || [])].some((value) =>
        value.toLocaleLowerCase().includes(term),
      )
    )
      matches.set(file.path, {
        path: file.path,
        snippet: file.issue || file.title || "",
      });
  }
  if (tokens.length) {
    const expression = tokens.map((token) => `"${token}"*`).join(" AND ");
    const rows = db
      .prepare(
        "SELECT path,snippet(vault_index_search,5,'','',' … ',36) AS snippet FROM vault_index_search WHERE vault_index_search MATCH ? AND vault_id=? ORDER BY bm25(vault_index_search,0,8,5,4,3,1) LIMIT ?",
      )
      .all(expression, id, limit + 1) as VaultSearchResult[];
    for (const row of rows)
      if (!matches.has(row.path)) matches.set(row.path, row);
  }
  return {
    results: [...matches.values()].slice(0, limit),
    more: matches.size > limit,
    status: state.inventory.status,
  };
}

export function vaultNoteContext(id: string, path: string) {
  const state = stateFor(id);
  const rows = db
    .prepare("SELECT metadata FROM vault_index_notes WHERE vault_id=?")
    .all(id) as { metadata: string }[];
  const all = rows.map((row) => JSON.parse(row.metadata) as Metadata);
  const current = all.find((note) => note.path === path);
  const backlinks: { path: string; label: string; line: number }[] = [];
  const unresolved: VaultLink[] = [];
  const files = [...state.inventory.files, ...state.inventory.assets];
  const resolve = createVaultLinkResolver(files);
  for (const note of all) {
    for (const link of note.links || []) {
      const resolved = resolve(link.target, note.path, link.format);
      if (
        resolved.kind === "note" &&
        resolved.path === path &&
        note.path !== path
      )
        backlinks.push({ path: note.path, label: link.label, line: link.line });
      if (
        note.path === path &&
        (resolved.kind === "missing" || resolved.kind === "ambiguous")
      )
        unresolved.push(link);
    }
  }
  return {
    headings: current?.headings || [],
    links: current?.links || [],
    backlinks,
    unresolved,
  };
}
