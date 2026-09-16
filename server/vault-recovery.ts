import { z } from "zod";
import { db } from "./store.ts";
import { getVault, notePath, vaultError } from "./vault.ts";
import type { VaultNote } from "../shared/vault.ts";
import type {
  VaultRecoveryDraft,
  VaultRecoveryDraftRecord,
  VaultRecoveryDraftSummary,
  VaultStorageCategory,
  VaultStorageInventory,
  VaultStorageStat,
} from "../shared/vault-recovery.ts";

const MAX_BYTES = 1024 * 1024;
const uuidSchema = z.string().uuid();
const pathSchema = z.string().min(1).max(500);
const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const noteSchema = z.object({
  path: pathSchema,
  text: z.string(),
  revision: revisionSchema,
  modified: z.number().finite().nonnegative(),
});
const draftSchema = z.object({
  path: pathSchema,
  text: z.string(),
  base: noteSchema.nullable(),
  generated: uuidSchema.optional(),
});
const versionSchema = z.number().int().nonnegative().safe();

db.exec(`
  CREATE TABLE IF NOT EXISTS vault_recovery_drafts (
    vault_id TEXT NOT NULL,
    path TEXT NOT NULL,
    text TEXT NOT NULL,
    base TEXT,
    generated TEXT,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    text_bytes INTEGER NOT NULL,
    base_bytes INTEGER NOT NULL,
    PRIMARY KEY (vault_id, path)
  );
  CREATE INDEX IF NOT EXISTS vault_recovery_updated
    ON vault_recovery_drafts (vault_id, updated_at DESC, path);
`);

type RecoveryRow = {
  vault_id: string;
  path: string;
  text: string;
  base: string | null;
  generated: string | null;
  updated_at: string;
  version: number;
  text_bytes: number;
  base_bytes: number;
};

function withDbTransaction<T>(work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function normalizedPath(value: unknown) {
  const parsed = pathSchema.parse(value);
  return notePath(parsed).join("/");
}

function assertByteLimit(value: string, label: string) {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > MAX_BYTES)
    throw vaultError(`${label} exceeds the 1 MB recovery limit.`);
  return bytes;
}

function assertVaultId(value: unknown) {
  const vaultId = uuidSchema.parse(value);
  getVault(vaultId);
  return vaultId;
}

function validatedDraft(value: unknown): VaultRecoveryDraft {
  const draft = draftSchema.parse(value);
  draft.path = normalizedPath(draft.path);
  if (draft.base && normalizedPath(draft.base.path) !== draft.path)
    throw vaultError("The recovery draft base belongs to another note.");
  assertByteLimit(draft.text, "The note draft");
  if (draft.base) assertByteLimit(draft.base.text, "The saved note");
  return draft;
}

function parseBase(value: string | null): VaultNote | null {
  if (value === null) return null;
  try {
    const base = noteSchema.parse(JSON.parse(value));
    assertByteLimit(base.text, "The saved note");
    base.path = normalizedPath(base.path);
    return base;
  } catch {
    throw vaultError(
      "A saved recovery draft is unreadable. Keep a copy before deleting it.",
      500,
    );
  }
}

function rowDraft(row: RecoveryRow): VaultRecoveryDraft {
  const draft = {
    path: normalizedPath(row.path),
    text: row.text,
    base: parseBase(row.base),
    ...(row.generated ? { generated: row.generated } : {}),
  } satisfies VaultRecoveryDraft;
  assertByteLimit(draft.text, "The note draft");
  return draft;
}

function rowSummary(row: RecoveryRow): VaultRecoveryDraftSummary {
  return {
    path: normalizedPath(row.path),
    updatedAt: row.updated_at,
    bytes: Number(row.text_bytes),
    version: Number(row.version),
    ...(row.generated ? { generated: row.generated } : {}),
  };
}

function rowRecord(row: RecoveryRow): VaultRecoveryDraftRecord {
  return { ...rowSummary(row), ...rowDraft(row) };
}

function rowFor(vaultId: string, path: string) {
  return db
    .prepare(
      `SELECT vault_id,path,text,base,generated,updated_at,version,text_bytes,base_bytes
       FROM vault_recovery_drafts WHERE vault_id=? AND path=?`,
    )
    .get(vaultId, path) as RecoveryRow | undefined;
}

function conflict(row: RecoveryRow | undefined, path: string): never {
  const error = vaultError(
    row
      ? "This recovery draft changed in another LMBook view. Reload it before saving."
      : "This recovery draft no longer exists. Reload the vault before saving.",
    409,
  ) as Error & { current?: VaultRecoveryDraftRecord };
  if (row) error.current = rowRecord(row);
  else error.current = undefined;
  throw error;
}

/** Return one durable editor draft, including its full contents. */
export function getVaultRecoveryDraft(
  vaultIdInput: unknown,
  pathInput: unknown,
): VaultRecoveryDraftRecord | null {
  const vaultId = assertVaultId(vaultIdInput);
  const path = normalizedPath(pathInput);
  const row = rowFor(vaultId, path);
  return row ? rowRecord(row) : null;
}

/** Return draft metadata only; note contents are loaded with getVaultRecoveryDraft. */
export function listVaultRecoveryDrafts(
  vaultIdInput: unknown,
): VaultRecoveryDraftSummary[] {
  const vaultId = assertVaultId(vaultIdInput);
  const rows = db
    .prepare(
      `SELECT vault_id,path,text,base,generated,updated_at,version,text_bytes,base_bytes
       FROM vault_recovery_drafts WHERE vault_id=? ORDER BY updated_at DESC, path`,
    )
    .all(vaultId) as RecoveryRow[];
  return rows.map(rowSummary);
}

/**
 * Insert or update one draft with an optimistic version check.
 * null means “create only”; an integer must match the stored version.
 */
export function upsertVaultRecoveryDraft(
  vaultIdInput: unknown,
  value: unknown,
  expectedVersionInput: unknown,
): VaultRecoveryDraftRecord {
  const vaultId = assertVaultId(vaultIdInput);
  const draft = validatedDraft(value);
  const expectedVersion =
    expectedVersionInput === null
      ? null
      : versionSchema.parse(expectedVersionInput);
  const textBytes = Buffer.byteLength(draft.text, "utf8");
  const baseBytes = draft.base ? Buffer.byteLength(draft.base.text, "utf8") : 0;
  const base = draft.base ? JSON.stringify(draft.base) : null;
  const generated = draft.generated ?? null;

  const save = () =>
    withDbTransaction(() => {
      const updatedAt = new Date().toISOString();
      const current = rowFor(vaultId, draft.path);
      if (!current) {
        if (expectedVersion !== null) conflict(undefined, draft.path);
        try {
          db.prepare(
            `INSERT INTO vault_recovery_drafts
           (vault_id,path,text,base,generated,updated_at,version,text_bytes,base_bytes)
           VALUES(?,?,?,?,?, ?,1,?,?)`,
          ).run(
            vaultId,
            draft.path,
            draft.text,
            base,
            generated,
            updatedAt,
            textBytes,
            baseBytes,
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "SQLITE_CONSTRAINT")
            conflict(rowFor(vaultId, draft.path), draft.path);
          throw error;
        }
      } else {
        if (
          expectedVersion === null ||
          expectedVersion !== Number(current.version)
        )
          conflict(current, draft.path);
        const result = db
          .prepare(
            `UPDATE vault_recovery_drafts
           SET text=?,base=?,generated=?,updated_at=?,version=?,text_bytes=?,base_bytes=?
           WHERE vault_id=? AND path=? AND version=?`,
          )
          .run(
            draft.text,
            base,
            generated,
            updatedAt,
            Number(current.version) + 1,
            textBytes,
            baseBytes,
            vaultId,
            draft.path,
            expectedVersion,
          );
        if (Number(result.changes) !== 1)
          conflict(rowFor(vaultId, draft.path), draft.path);
      }
      const saved = rowFor(vaultId, draft.path);
      if (!saved)
        throw vaultError("The recovery draft could not be saved.", 500);
      return rowRecord(saved);
    });
  return save();
}

/** Delete one explicitly named recovery draft. With a version, deletion is CAS-protected. */
export function deleteVaultRecoveryDraft(
  vaultIdInput: unknown,
  pathInput: unknown,
  expectedVersionInput?: unknown,
): { deleted: boolean; path: string; version?: number } {
  const vaultId = assertVaultId(vaultIdInput);
  const path = normalizedPath(pathInput);
  const expectedVersion =
    expectedVersionInput === undefined || expectedVersionInput === null
      ? null
      : versionSchema.parse(expectedVersionInput);
  const current = rowFor(vaultId, path);
  if (!current) return { deleted: false, path };
  if (expectedVersion === null || expectedVersion !== Number(current.version))
    conflict(current, path);
  const result = db
    .prepare(
      "DELETE FROM vault_recovery_drafts WHERE vault_id=? AND path=? AND version=?",
    )
    .run(vaultId, path, expectedVersion);
  if (Number(result.changes) !== 1) conflict(rowFor(vaultId, path), path);
  return { deleted: true, path, version: Number(current.version) };
}

/** Delete one explicitly selected generated summary draft. */
export function deleteVaultGeneration(
  vaultIdInput: unknown,
  draftIdInput: unknown,
): { deleted: boolean; id: string } {
  const vaultId = assertVaultId(vaultIdInput);
  const draftId = uuidSchema.parse(draftIdInput);
  const result = db
    .prepare("DELETE FROM vault_generations WHERE vault_id=? AND id=?")
    .run(vaultId, draftId);
  return { deleted: Number(result.changes) === 1, id: draftId };
}

function tableExists(table: string) {
  return !!db
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get(table);
}

function tableColumns(table: string) {
  if (!tableExists(table)) return [];
  return (
    db.prepare(`PRAGMA table_info(\"${table}\")`).all() as { name: string }[]
  ).map((column) => column.name);
}

function quoteIdentifier(value: string) {
  return `\"${value.replaceAll('"', '""')}\"`;
}

function tableStat(
  table: string,
  vaultId: string,
  textBytes: string[],
  numericBytes: string[] = [],
) {
  const columns = tableColumns(table);
  if (!columns.includes("vault_id"))
    return { count: 0, bytes: 0 } satisfies VaultStorageStat;
  const textExpressions = textBytes
    .filter((column) => columns.includes(column))
    .map(
      (column) =>
        `COALESCE(length(CAST(${quoteIdentifier(column)} AS BLOB)),0)`,
    );
  const numericExpressions = numericBytes
    .filter((column) => columns.includes(column))
    .map((column) => `COALESCE(CAST(${quoteIdentifier(column)} AS INTEGER),0)`);
  const byteExpressions = [...numericExpressions, ...textExpressions];
  const expression = byteExpressions.length ? byteExpressions.join("+") : "0";
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(${expression}),0) AS bytes
       FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier("vault_id")}=?`,
    )
    .get(vaultId) as { count: number; bytes: number };
  return {
    count: Number(row.count),
    bytes: Number(row.bytes),
  } satisfies VaultStorageStat;
}

function indexStat(vaultId: string): VaultStorageStat {
  const notes = tableStat(
    "vault_index_notes",
    vaultId,
    ["metadata"],
    ["bytes"],
  );
  const inventory = tableStat("vault_index_inventory", vaultId, ["body"]);
  const semantic = tableStat("vault_semantic_chunks", vaultId, ["text", "vector"]);
  // FTS rows duplicate note bodies; count notes and their metadata/inventory only.
  return {
    count: notes.count,
    bytes: notes.bytes + inventory.bytes + semantic.bytes,
  };
}

/** Inventory for the user-facing lifecycle screen; no category is purged implicitly. */
export function getVaultStorageInventory(
  vaultIdInput: unknown,
): VaultStorageInventory {
  const vaultId = assertVaultId(vaultIdInput);
  return {
    history: tableStat("vault_history", vaultId, ["content"]),
    generations: tableStat("vault_generations", vaultId, ["body"]),
    recovery: tableStat(
      "vault_recovery_drafts",
      vaultId,
      [],
      ["text_bytes", "base_bytes"],
    ),
    index: indexStat(vaultId),
  };
}

/**
 * Explicitly purge one named non-recovery category. Recovery drafts require
 * deleteVaultRecoveryDraft(path), so unfinished work is never swept by this API.
 */
export function purgeVaultStorage(
  vaultIdInput: unknown,
  categoryInput: unknown,
): { category: VaultStorageCategory; removed: VaultStorageStat } {
  const vaultId = assertVaultId(vaultIdInput);
  const category = z
    .enum(["history", "generated", "index"])
    .parse(categoryInput) as VaultStorageCategory;
  const before = getVaultStorageInventory(vaultId);
  const purge = () =>
    withDbTransaction(() => {
      if (category === "history")
        db.prepare("DELETE FROM vault_history WHERE vault_id=?").run(vaultId);
      if (category === "generated")
        db.prepare("DELETE FROM vault_generations WHERE vault_id=?").run(
          vaultId,
        );
      if (category === "index") {
        for (const table of [
          "vault_index_search",
          "vault_index_notes",
          "vault_index_inventory",
          "vault_semantic_chunks",
          "vault_semantic_staging",
          "vault_semantic_status",
        ] as const) {
          if (tableColumns(table).includes("vault_id"))
            db.prepare(
              `DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier("vault_id")}=?`,
            ).run(vaultId);
        }
      }
    });
  purge();
  const after = getVaultStorageInventory(vaultId);
  const stat =
    category === "history"
      ? before.history
      : category === "generated"
        ? before.generations
        : before.index;
  const remaining =
    category === "history"
      ? after.history
      : category === "generated"
        ? after.generations
        : after.index;
  return {
    category,
    removed: {
      count: Math.max(0, stat.count - remaining.count),
      bytes: Math.max(0, stat.bytes - remaining.bytes),
    },
  };
}
