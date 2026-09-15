import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { settingsSchema, uid, type Notebook } from "../shared/model.ts";
import { savedEpisodeSettingsSchema } from "../shared/speech.ts";

export const dataDir = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });
export const audioDir = path.join(dataDir, "audio");
mkdirSync(audioDir, { recursive: true });
export const originalsDir = path.join(dataDir, "originals");
mkdirSync(originalsDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, "sennibook.sqlite"));
db.exec(
  "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notebook_trash (id TEXT PRIMARY KEY, title TEXT NOT NULL, deleted_at TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('trashed', 'purging')), error TEXT, body TEXT NOT NULL)",
);
const notebookSummaryTable = "notebook_summaries";
const notebookSummaryIndex = "notebook_summaries_updated_idx";
const notebookSummaryDefaultSubject = settingsSchema.parse({}).subject;
const notebookSummaryDefaultSubjectSql = `'${notebookSummaryDefaultSubject.replaceAll("'", "''")}'`;
const notebookSummaryTriggers = {
  insert: "notebooks_summary_insert",
  update: "notebooks_summary_update",
  delete: "notebooks_summary_delete",
} as const;

export type NotebookSummary = {
  id: string;
  title: string;
  subject: string;
  sourceCount: number;
  example: boolean;
};

function notebookSummaryExpressions(body: string) {
  return [
    `COALESCE(json_extract(${body}, '$.title'), '')`,
    `COALESCE(json_extract(${body}, '$.settings.subject'), ${notebookSummaryDefaultSubjectSql})`,
    `COALESCE(json_array_length(json_extract(${body}, '$.sources')), 0)`,
    `COALESCE(json_extract(${body}, '$.example'), 0)`,
    `COALESCE(json_extract(${body}, '$.updatedAt'), '')`,
  ];
}

function notebookSummaryUpsert(id: string, body: string) {
  const [title, subject, sourceCount, example, updatedAt] =
    notebookSummaryExpressions(body);
  return `
    INSERT INTO ${notebookSummaryTable}
      (id, title, subject, source_count, example, updated_at)
    VALUES (${id}, ${title}, ${subject}, ${sourceCount}, ${example}, ${updatedAt})
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      subject = excluded.subject,
      source_count = excluded.source_count,
      example = excluded.example,
      updated_at = excluded.updated_at;
  `;
}

function inspectNotebookSummaryTable(): "missing" | "compatible" {
  const object = db
    .prepare(
      "SELECT type FROM sqlite_master WHERE name = ? AND name NOT LIKE 'sqlite_%'",
    )
    .get(notebookSummaryTable) as { type: string } | undefined;
  if (!object) return "missing";
  if (object.type !== "table")
    throw new Error(
      `Cannot initialize notebook summaries: ${notebookSummaryTable} is not a table.`,
    );
  const columns = db
    .prepare(`PRAGMA table_info(${notebookSummaryTable})`)
    .all() as { name: string; type: string; pk: number }[];
  const expected = [
    ["id", "TEXT", 1],
    ["title", "TEXT", 0],
    ["subject", "TEXT", 0],
    ["source_count", "INTEGER", 0],
    ["example", "INTEGER", 0],
    ["updated_at", "TEXT", 0],
  ];
  if (
    columns.length !== expected.length ||
    columns.some(
      (column, index) =>
        column.name !== expected[index][0] ||
        column.type.toUpperCase() !== expected[index][1] ||
        column.pk !== expected[index][2],
    )
  )
    throw new Error(
      `Cannot initialize notebook summaries: ${notebookSummaryTable} has an incompatible schema.`,
    );
  return "compatible";
}

function inspectNotebookSummaryIndex(): boolean {
  const object = db
    .prepare("SELECT type, tbl_name FROM sqlite_master WHERE name = ?")
    .get(notebookSummaryIndex) as
    | { type: string; tbl_name: string }
    | undefined;
  if (!object) return false;
  if (object.type !== "index" || object.tbl_name !== notebookSummaryTable)
    throw new Error(
      `Cannot initialize notebook summaries: ${notebookSummaryIndex} is incompatible.`,
    );
  const columns = db
    .prepare(`PRAGMA index_info(${notebookSummaryIndex})`)
    .all() as { name: string }[];
  if (columns.length !== 1 || columns[0].name !== "updated_at")
    throw new Error(
      `Cannot initialize notebook summaries: ${notebookSummaryIndex} is incompatible.`,
    );
  return true;
}

function inspectNotebookSummaryTrigger(
  name: string,
  event: string,
  requiresJsonExtract = true,
): boolean {
  const object = db
    .prepare("SELECT type, sql FROM sqlite_master WHERE name = ?")
    .get(name) as { type: string; sql: string | null } | undefined;
  if (!object) return false;
  const sql = object.sql?.toLowerCase() || "";
  if (
    object.type !== "trigger" ||
    !sql.includes(`after ${event} on notebooks`) ||
    !sql.includes(notebookSummaryTable) ||
    (requiresJsonExtract && !sql.includes("json_extract"))
  )
    throw new Error(
      `Cannot initialize notebook summaries: trigger ${name} is incompatible.`,
    );
  return true;
}

function installNotebookSummaryTriggers() {
  if (!inspectNotebookSummaryTrigger(notebookSummaryTriggers.insert, "insert"))
    db.exec(`
      CREATE TRIGGER ${notebookSummaryTriggers.insert}
      AFTER INSERT ON notebooks
      BEGIN
        ${notebookSummaryUpsert("NEW.id", "NEW.body")}
      END;
    `);
  if (!inspectNotebookSummaryTrigger(notebookSummaryTriggers.update, "update of body"))
    db.exec(`
      CREATE TRIGGER ${notebookSummaryTriggers.update}
      AFTER UPDATE OF body ON notebooks
      BEGIN
        ${notebookSummaryUpsert("NEW.id", "NEW.body")}
      END;
    `);
  if (!inspectNotebookSummaryTrigger(notebookSummaryTriggers.delete, "delete", false))
    db.exec(`
      CREATE TRIGGER ${notebookSummaryTriggers.delete}
      AFTER DELETE ON notebooks
      BEGIN
        DELETE FROM ${notebookSummaryTable} WHERE id = OLD.id;
      END;
    `);
}

function rebuildNotebookSummaries() {
  const [title, subject, sourceCount, example, updatedAt] =
    notebookSummaryExpressions("body");
  db.exec(`DELETE FROM ${notebookSummaryTable}`);
  db.exec(`
    INSERT INTO ${notebookSummaryTable}
      (id, title, subject, source_count, example, updated_at)
    SELECT id, ${title}, ${subject}, ${sourceCount}, ${example}, ${updatedAt}
    FROM notebooks;
  `);
  const counts = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM notebooks) AS notebook_count,
        (SELECT COUNT(*) FROM ${notebookSummaryTable}) AS summary_count,
        (SELECT COUNT(*) FROM ${notebookSummaryTable} AS summaries
          WHERE NOT EXISTS (SELECT 1 FROM notebooks WHERE notebooks.id = summaries.id)) AS orphan_count
    `)
    .get() as {
    notebook_count: number;
    summary_count: number;
    orphan_count: number;
  };
  if (
    counts.notebook_count !== counts.summary_count ||
    counts.orphan_count !== 0
  )
    throw new Error("Notebook summary migration did not cover every notebook.");
}

function ensureNotebookSummarySchema() {
  const table = inspectNotebookSummaryTable();
  const index = table === "compatible" && inspectNotebookSummaryIndex();
  const triggers =
    table === "compatible"
      ? [
          inspectNotebookSummaryTrigger(
            notebookSummaryTriggers.insert,
            "insert",
          ),
          inspectNotebookSummaryTrigger(
            notebookSummaryTriggers.update,
            "update of body",
          ),
          inspectNotebookSummaryTrigger(
            notebookSummaryTriggers.delete,
            "delete",
            false,
          ),
        ]
      : [false, false, false];
  if (table === "compatible" && index && triggers.every(Boolean)) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const tableWasMissing = inspectNotebookSummaryTable() === "missing";
    if (tableWasMissing)
      db.exec(`
        CREATE TABLE ${notebookSummaryTable} (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          subject TEXT NOT NULL,
          source_count INTEGER NOT NULL,
          example INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    if (!inspectNotebookSummaryIndex())
      db.exec(
        `CREATE INDEX ${notebookSummaryIndex} ON ${notebookSummaryTable}(updated_at DESC)`,
      );

    if (tableWasMissing) {
      const [title, subject, sourceCount, example, updatedAt] =
        notebookSummaryExpressions("body");
      db.exec(`
        INSERT INTO ${notebookSummaryTable}
          (id, title, subject, source_count, example, updated_at)
        SELECT id, ${title}, ${subject}, ${sourceCount}, ${example}, ${updatedAt}
        FROM notebooks;
      `);
    }
    installNotebookSummaryTriggers();
    if (!tableWasMissing && triggers.some((present) => !present))
      rebuildNotebookSummaries();
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export function listNotebooks(): Notebook[] {
  return (db.prepare("SELECT body FROM notebooks").all() as { body: string }[])
    .map((r) => normalizeNotebook(JSON.parse(r.body)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function listNotebookSummaries(): NotebookSummary[] {
  return (
    db
      .prepare(
        `SELECT id, title, subject, source_count, example
         FROM ${notebookSummaryTable}
         ORDER BY updated_at DESC`,
      )
      .all() as {
      id: string;
      title: string;
      subject: string;
      source_count: number;
      example: number;
    }[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    sourceCount: row.source_count,
    example: row.example !== 0,
  }));
}
export function getNotebook(id: string): Notebook {
  const row = db.prepare("SELECT body FROM notebooks WHERE id = ?").get(id) as
    { body: string } | undefined;
  if (!row)
    throw Object.assign(new Error("Notebook not found."), { status: 404 });
  return normalizeNotebook(JSON.parse(row.body));
}
function normalizeNotebook(notebook: Notebook): Notebook {
  notebook.settings = settingsSchema.parse(notebook.settings);
  for (const episode of notebook.episodes)
    episode.settings = savedEpisodeSettingsSchema.parse(episode.settings);
  return notebook;
}
type TrashState = "trashed" | "purging";
export type NotebookTrashRecord = {
  id: string;
  title: string;
  deletedAt: string;
  state: TrashState;
  error?: string;
  notebook: Notebook;
};

function parseTrashRow(row: {
  id: string;
  title: string;
  deleted_at: string;
  state: string;
  error: string | null;
  body: string;
}): NotebookTrashRecord {
  if (row.state !== "trashed" && row.state !== "purging")
    throw new Error(`Notebook trash entry ${row.id} has an invalid state.`);
  let raw: unknown;
  try {
    raw = JSON.parse(row.body);
  } catch {
    throw new Error(`Notebook trash entry ${row.id} is not valid JSON.`);
  }
  const notebook = normalizeNotebook(raw as Notebook);
  if (notebook.id !== row.id)
    throw new Error(
      `Notebook trash entry ${row.id} has mismatched notebook metadata.`,
    );
  return {
    id: row.id,
    title: row.title,
    deletedAt: row.deleted_at,
    state: row.state,
    ...(row.error ? { error: row.error } : {}),
    notebook,
  };
}

export function listTrashedNotebooks(): NotebookTrashRecord[] {
  return (
    db
      .prepare(
        "SELECT id, title, deleted_at, state, error, body FROM notebook_trash ORDER BY deleted_at DESC",
      )
      .all() as {
      id: string;
      title: string;
      deleted_at: string;
      state: string;
      error: string | null;
      body: string;
    }[]
  ).map(parseTrashRow);
}

export function getTrashedNotebook(id: string): NotebookTrashRecord {
  const row = db
    .prepare(
      "SELECT id, title, deleted_at, state, error, body FROM notebook_trash WHERE id = ?",
    )
    .get(id) as
    | {
        id: string;
        title: string;
        deleted_at: string;
        state: string;
        error: string | null;
        body: string;
      }
    | undefined;
  if (!row)
    throw Object.assign(new Error("Trash entry not found."), { status: 404 });
  return parseTrashRow(row);
}

export function trashNotebook(notebook: Notebook) {
  const deletedAt = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO notebook_trash (id, title, deleted_at, state, error, body) VALUES (?, ?, ?, 'trashed', NULL, ?)",
    ).run(notebook.id, notebook.title, deletedAt, JSON.stringify(notebook));
    db.prepare("DELETE FROM notebooks WHERE id = ?").run(notebook.id);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
  return { id: notebook.id, deletedAt };
}

export function restoreNotebookFromTrash(id: string): Notebook {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare(
        "SELECT id, title, deleted_at, state, error, body FROM notebook_trash WHERE id = ?",
      )
      .get(id) as
      | {
          id: string;
          title: string;
          deleted_at: string;
          state: string;
          error: string | null;
          body: string;
        }
      | undefined;
    if (!row)
      throw Object.assign(new Error("Trash entry not found."), { status: 404 });
    if (row.state !== "trashed")
      throw Object.assign(
        new Error(
          "This trash entry is being permanently deleted and cannot be restored.",
        ),
        { status: 409 },
      );
    if (
      db.prepare("SELECT 1 FROM notebooks WHERE id = ?").get(id) !== undefined
    )
      throw Object.assign(
        new Error("A notebook with this ID already exists."),
        { status: 409 },
      );
    const notebook = parseTrashRow(row).notebook;
    db.prepare("INSERT INTO notebooks (id, body) VALUES (?, ?)").run(
      notebook.id,
      JSON.stringify(notebook),
    );
    db.prepare("DELETE FROM notebook_trash WHERE id = ?").run(id);
    db.exec("COMMIT");
    return notebook;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export function markTrashPurging(id: string): NotebookTrashRecord {
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db
      .prepare(
        "SELECT id, title, deleted_at, state, error, body FROM notebook_trash WHERE id = ?",
      )
      .get(id) as
      | {
          id: string;
          title: string;
          deleted_at: string;
          state: string;
          error: string | null;
          body: string;
        }
      | undefined;
    if (!row)
      throw Object.assign(new Error("Trash entry not found."), { status: 404 });
    if (row.state === "trashed")
      db.prepare(
        "UPDATE notebook_trash SET state = 'purging', error = NULL WHERE id = ?",
      ).run(id);
    else if (row.state !== "purging")
      throw new Error(`Notebook trash entry ${id} has an invalid state.`);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
  return getTrashedNotebook(id);
}

export function setTrashPurgeError(id: string, error: string) {
  db.prepare(
    "UPDATE notebook_trash SET error = ? WHERE id = ? AND state = 'purging'",
  ).run(error.slice(0, 5000), id);
}

export function setTrashError(id: string, error: string) {
  db.prepare("UPDATE notebook_trash SET error = ? WHERE id = ?").run(
    error.slice(0, 5000),
    id,
  );
}

export function completeTrashPurge(id: string) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const removed = db
      .prepare("DELETE FROM notebook_trash WHERE id = ? AND state = 'purging'")
      .run(id);
    // Activity belongs to the notebook, including when it is in Trash.
    // The activity module initializes this optional table independently.
    if (
      removed.changes &&
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'generation_activity'",
        )
        .get()
    )
      db.prepare("DELETE FROM generation_activity WHERE notebook_id = ?").run(
        id,
      );
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}
export function saveNotebook(n: Notebook) {
  n.updatedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO notebooks VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body",
  ).run(n.id, JSON.stringify(n));
  return n;
}
export function newNotebook(title: string, example = false): Notebook {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title,
    description: "",
    example,
    createdAt: now,
    updatedAt: now,
    settings: settingsSchema.parse({}),
    sources: [],
    objectives: [],
    coverage: [],
    episodes: [],
    messages: [],
  };
}
// Persist interrupted work as recoverable, never leave a phantom spinner after restart.
ensureNotebookSummarySchema();
for (const n of listNotebooks()) {
  let changed = false;
  for (const source of n.sources) {
    if (
      source.processing?.status === "transcribing" ||
      source.processing?.status === "recognizing"
    ) {
      const ocr = source.processing.status === "recognizing";
      source.processing = {
        ...source.processing,
        task: ocr ? "ocr" : source.processing.task,
        status: "failed",
        error: ocr
          ? "OCR was interrupted. The original source is saved; start OCR again when ready."
          : "Transcription was interrupted. The original recording is saved; start transcription again when ready.",
      };
      changed = true;
    }
  }
  for (const e of n.episodes)
    if (e.status === "script" || e.status === "audio") {
      e.status = "error";
      e.error =
        "Generation was interrupted when the server stopped. Completed chapters are saved; retry to continue.";
      changed = true;
    }
  if (changed) saveNotebook(n);
}
