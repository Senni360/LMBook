import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  realpath,
  readdir,
  open,
  rename,
  unlink,
  link,
} from "node:fs/promises";
import path from "node:path";
import { db } from "./store.ts";
import { withArtifactMutation } from "./artifact-lock.ts";
import type {
  Vault,
  VaultFile,
  VaultNote,
  VaultDraft,
} from "../shared/vault.ts";

const MAX_BYTES = 1024 * 1024;
db.exec(`CREATE TABLE IF NOT EXISTS vaults (id TEXT PRIMARY KEY, name TEXT NOT NULL, root TEXT UNIQUE NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS vault_history (id TEXT PRIMARY KEY, vault_id TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL, content BLOB NOT NULL);
  CREATE TABLE IF NOT EXISTS vault_generations (id TEXT PRIMARY KEY, vault_id TEXT NOT NULL, body TEXT NOT NULL);`);
if (
  !(db.prepare("PRAGMA table_info(vaults)").all() as { name: string }[]).some(
    (column) => column.name === "active",
  )
)
  db.exec("ALTER TABLE vaults ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
db.exec(
  "CREATE INDEX IF NOT EXISTS vault_history_path ON vault_history(vault_id,path,created_at); CREATE INDEX IF NOT EXISTS vault_generations_vault ON vault_generations(vault_id)",
);

export function vaultError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}
export const listVaults = () =>
  db
    .prepare("SELECT id, name, root FROM vaults WHERE active=1 ORDER BY name")
    .all() as Vault[];
export function getVault(id: string) {
  const vault = listVaults().find((item) => item.id === id);
  if (!vault)
    throw vaultError(
      "This vault is disconnected. Choose its folder again.",
      404,
    );
  return vault;
}
export async function connectVault(folder: string) {
  const root = await realpath(folder);
  if (!(await lstat(root)).isDirectory() || root === path.parse(root).root)
    throw vaultError("Choose a vault folder, not an entire drive.");
  const old = (
    db.prepare("SELECT id,name,root FROM vaults").all() as Vault[]
  ).find((v) =>
    process.platform === "win32"
      ? v.root.toLowerCase() === root.toLowerCase()
      : v.root === root,
  );
  if (old) {
    db.prepare("UPDATE vaults SET active=1 WHERE id=?").run(old.id);
    return old;
  }
  const vault = { id: randomUUID(), name: path.basename(root), root };
  db.prepare("INSERT INTO vaults (id, name, root) VALUES (?, ?, ?)").run(
    vault.id,
    vault.name,
    root,
  );
  return vault;
}
export function disconnectVault(id: string) {
  getVault(id);
  db.prepare("UPDATE vaults SET active=0 WHERE id = ?").run(id);
  // Recovery history and generated source snapshots stay local after disconnecting.
}

export function notePath(value: string) {
  if (value.length > 500 || !/\.md$/i.test(value))
    throw vaultError("Use a Markdown filename ending in .md.");
  const parts = value.split("/");
  if (
    parts.some(
      (p) =>
        !p ||
        p.startsWith(".") ||
        /[\\:<>"|?*\x00-\x1f]/.test(p) ||
        /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
    )
  )
    throw vaultError(
      "Use a relative note path with ordinary folder and file names. Hidden files are excluded.",
    );
  return parts;
}

async function checkedPath(vault: Vault, relative: string, creating = false) {
  const parts = notePath(relative);
  const canonical = await realpath(vault.root).catch(() => {
    throw vaultError(
      "The vault folder is unavailable. Reconnect its drive or choose the folder again.",
      404,
    );
  });
  if (canonical !== vault.root)
    throw vaultError(
      "The vault folder moved or became a link. Connect it again.",
    );
  let target = canonical;
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (creating && i === parts.length - 1 && error.code === "ENOENT")
        return null;
      if (error.code === "ENOENT")
        throw vaultError(
          "This note or folder no longer exists. Refresh the vault; your draft is still available.",
          404,
        );
      throw error;
    });
    if (
      info?.isSymbolicLink() ||
      (info && (i === parts.length - 1 ? !info.isFile() : !info.isDirectory()))
    )
      throw vaultError(
        "Linked files and folders cannot be edited through LMBook.",
      );
  }
  return target;
}

export async function scanVault(id: string) {
  const vault = getVault(id);
  if ((await realpath(vault.root)) !== vault.root)
    throw vaultError("The vault folder moved. Connect it again.");
  const files: VaultFile[] = [];
  const warnings: string[] = [];
  let visited = 0;
  async function walk(folder: string, prefix = "", depth = 0) {
    if (depth > 32 || visited >= 30000) {
      warnings.push(
        "This vault is too large to list completely. Connect a smaller folder.",
      );
      return;
    }
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => {
      warnings.push(`Could not read ${prefix || "the vault folder"}.`);
      return [];
    });
    for (const entry of entries) {
      if (++visited > 30000) break;
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory())
        await walk(path.join(folder, entry.name), relative + "/", depth + 1);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        try {
          const safe = await checkedPath(vault, relative);
          const info = await lstat(safe);
          files.push({
            path: relative,
            bytes: info.size,
            modified: info.mtimeMs,
          });
        } catch {
          warnings.push(`Could not read ${relative}.`);
        }
      }
    }
  }
  await walk(vault.root);
  if (visited >= 30000)
    warnings.push(
      "Listing stopped at 30,000 entries. Connect a smaller folder to see the rest.",
    );
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, warnings: [...new Set(warnings)].slice(0, 10) };
}

const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function decode(bytes: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/\r\n/g, "\n");
  } catch {
    throw vaultError(
      "This note is not UTF-8 Markdown. Convert a copy to UTF-8 in Obsidian before editing it here.",
    );
  }
}
export async function readVaultNote(id: string, relative: string) {
  const file = await checkedPath(getVault(id), relative);
  const handle = await open(file, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BYTES)
      throw vaultError(
        "The note exceeds the 1 MB editor limit. Split it into smaller notes.",
      );
    const bytes = await handle.readFile();
    if (bytes.length > MAX_BYTES)
      throw vaultError("The note exceeds the 1 MB editor limit.");
    return {
      note: {
        path: relative,
        text: decode(bytes),
        revision: digest(bytes),
        modified: info.mtimeMs,
      } satisfies VaultNote,
      bytes,
      mode: info.mode,
    };
  } finally {
    await handle.close();
  }
}

function archive(id: string, relative: string, bytes: Buffer, reason: string) {
  const record = randomUUID();
  db.prepare(
    "INSERT INTO vault_history (id,vault_id,path,created_at,reason,content) VALUES (?,?,?,?,?,?)",
  ).run(record, id, relative, new Date().toISOString(), reason, bytes);
  return record;
}
export function listHistory(id: string, relative: string) {
  getVault(id);
  notePath(relative);
  return db
    .prepare(
      "SELECT id,created_at AS createdAt,reason FROM vault_history WHERE vault_id=? AND path=? ORDER BY created_at DESC LIMIT 30",
    )
    .all(id, relative);
}
export function readHistory(id: string, record: string) {
  getVault(id);
  const result = db
    .prepare("SELECT content FROM vault_history WHERE vault_id=? AND id=?")
    .get(id, record) as { content: Uint8Array } | undefined;
  if (!result) throw vaultError("That saved version is unavailable.", 404);
  return { text: decode(Buffer.from(result.content)) };
}

export async function saveVaultNote(
  id: string,
  relative: string,
  text: string,
  revision: string | null,
) {
  if (Buffer.byteLength(text) > MAX_BYTES)
    throw vaultError("The note exceeds the 1 MB editor limit.");
  return withArtifactMutation(async () => {
    const vault = getVault(id);
    const target = await checkedPath(vault, relative, revision === null);
    if (revision === null)
      archive(id, relative, Buffer.from(text), "New note draft");
    let previous: Awaited<ReturnType<typeof readVaultNote>> | undefined;
    if (revision !== null) {
      archive(id, relative, Buffer.from(text), "Unpublished draft");
      previous = await readVaultNote(id, relative);
      if (previous.note.revision !== revision)
        throw vaultError(
          "This note changed outside LMBook. Compare the saved note with your draft before saving.",
          409,
        );
      if (previous.note.text === text) return previous.note;
      archive(id, relative, previous.bytes, "Before LMBook edit");
    }
    const crlf = previous?.bytes.includes(Buffer.from("\r\n"));
    const bom = previous?.bytes
      .subarray(0, 3)
      .equals(Buffer.from([239, 187, 191]));
    const bytes = Buffer.from(
      (bom ? "\ufeff" : "") + (crlf ? text.replace(/\r?\n/g, "\r\n") : text),
    );
    const temporary = path.join(
      path.dirname(target),
      `.lmbook-${randomUUID()}.tmp`,
    );
    try {
      const handle = await open(temporary, "wx", previous?.mode ?? 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await checkedPath(vault, relative, revision === null);
      if (revision === null) {
        // A hard link publishes the completed file only if the name is still free.
        await link(temporary, target).catch(
          async (error: NodeJS.ErrnoException) => {
            if (error.code === "EEXIST")
              throw vaultError(
                "A note already uses this name. Choose another filename.",
                409,
              );
            if (
              !["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(
                error.code || "",
              )
            )
              throw error;
            // Exclusive create supports volumes without hard links. A failed partial
            // write stays inspectable; the complete draft is already in local history.
            const handle = await open(target, "wx", 0o600).catch(
              (failure: NodeJS.ErrnoException) => {
                if (failure.code === "EEXIST")
                  throw vaultError(
                    "A note already uses this name. Choose another filename.",
                    409,
                  );
                throw vaultError(
                  "This folder could not create the note. Check its write permissions; your draft has been kept.",
                );
              },
            );
            try {
              await handle.writeFile(bytes);
              await handle.sync();
            } catch {
              throw vaultError(
                "The new file could not finish saving. Your complete draft is kept in LMBook. Check disk space, then inspect the file before retrying.",
              );
            } finally {
              await handle.close();
            }
          },
        );
      } else {
        if ((await readVaultNote(id, relative)).note.revision !== revision)
          throw vaultError(
            "This note changed while saving. Your draft is safe; compare versions and retry.",
            409,
          );
        await rename(temporary, target);
      }
      return (await readVaultNote(id, relative)).note;
    } finally {
      await unlink(temporary).catch(() => {});
    }
  });
}

export function storeGeneration(vaultId: string, draft: VaultDraft) {
  db.prepare(
    "INSERT INTO vault_generations(id,vault_id,body) VALUES(?,?,?)",
  ).run(draft.id, vaultId, JSON.stringify(draft));
}
export function listGenerations(vaultId: string, offset = 0) {
  getVault(vaultId);
  return (
    db
      .prepare(
        "SELECT body FROM vault_generations WHERE vault_id=? ORDER BY rowid DESC LIMIT 20 OFFSET ?",
      )
      .all(vaultId, offset) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as VaultDraft);
}
export function readGeneration(vaultId: string, draftId: string): VaultDraft {
  getVault(vaultId);
  const row = db
    .prepare("SELECT body FROM vault_generations WHERE vault_id=? AND id=?")
    .get(vaultId, draftId) as { body: string } | undefined;
  if (!row) throw vaultError("This summary draft is unavailable.", 404);
  return JSON.parse(row.body);
}
