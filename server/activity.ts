import { randomUUID } from "node:crypto";
import { db } from "./store.ts";

export type ActivityOperation = "script" | "audio" | "preview";
export type ActivityState =
  "running" | "completed" | "cancelled" | "interrupted" | "failed";

export type ActivityRow = {
  id: string;
  notebookId: string;
  episodeId: string;
  operation: ActivityOperation;
  state: ActivityState;
  progress: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
};

const MAX_PROGRESS_LENGTH = 500;
const MAX_ERROR_LENGTH = 2000;
const MAX_LIST_LIMIT = 50;
const terminalStates = new Set<ActivityState>([
  "completed",
  "cancelled",
  "interrupted",
  "failed",
]);

db.exec(`
  CREATE TABLE IF NOT EXISTS generation_activity (
    id TEXT PRIMARY KEY,
    notebook_id TEXT NOT NULL,
    episode_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('script', 'audio', 'preview')),
    state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'cancelled', 'interrupted', 'failed')),
    progress TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS generation_activity_notebook_updated
    ON generation_activity (notebook_id, updated_at DESC);
`);

function now() {
  return new Date().toISOString();
}

function bounded(value: string, length: number) {
  return value.slice(0, length);
}

function assertOperation(
  operation: string,
): asserts operation is ActivityOperation {
  if (!(["script", "audio", "preview"] as string[]).includes(operation))
    throw new Error("Unsupported generation activity operation.");
}

function assertState(state: string): asserts state is ActivityState {
  if (
    !(
      ["running", "completed", "cancelled", "interrupted", "failed"] as string[]
    ).includes(state)
  )
    throw new Error("Unsupported generation activity state.");
}

export function beginActivity(input: {
  notebookId: string;
  episodeId: string;
  operation: ActivityOperation;
}) {
  assertOperation(input.operation);
  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    `INSERT INTO generation_activity
      (id, notebook_id, episode_id, operation, state, progress, started_at, updated_at)
     VALUES (?, ?, ?, ?, 'running', '', ?, ?)`,
  ).run(
    id,
    bounded(input.notebookId, 200),
    bounded(input.episodeId, 200),
    input.operation,
    timestamp,
    timestamp,
  );
  return id;
}

export function updateActivity(
  id: string,
  update: {
    progress?: string;
    state?: ActivityState;
    error?: string;
  },
) {
  const assignments: string[] = [];
  const values: string[] = [];
  if (update.progress !== undefined) {
    assignments.push("progress = ?");
    values.push(bounded(update.progress, MAX_PROGRESS_LENGTH));
  }
  if (update.state !== undefined) {
    assertState(update.state);
    assignments.push("state = ?");
    values.push(update.state);
    if (terminalStates.has(update.state)) assignments.push("finished_at = ?");
    values.push(...(terminalStates.has(update.state) ? [now()] : []));
  }
  if (update.error !== undefined) {
    assignments.push("error = ?");
    values.push(bounded(update.error, MAX_ERROR_LENGTH));
  }
  if (!assignments.length) return;
  assignments.push("updated_at = ?");
  values.push(now(), id);
  db.prepare(
    `UPDATE generation_activity SET ${assignments.join(", ")} WHERE id = ?`,
  ).run(...values);
}

export function listActivity(notebookId: string, limit = 20): ActivityRow[] {
  const safeLimit = Math.min(
    MAX_LIST_LIMIT,
    Math.max(1, Number.isFinite(limit) ? Math.trunc(limit) : 20),
  );
  const rows = db
    .prepare(
      `SELECT
         id,
         notebook_id AS notebookId,
         episode_id AS episodeId,
         operation,
         state,
         progress,
         started_at AS startedAt,
         updated_at AS updatedAt,
         finished_at AS finishedAt,
         error
       FROM generation_activity
       WHERE notebook_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(bounded(notebookId, 200), safeLimit) as Array<
    Partial<ActivityRow> & {
      notebookId: string;
      episodeId: string;
      operation: ActivityOperation;
      state: ActivityState;
      progress: string;
      startedAt: string;
      updatedAt: string;
    }
  >;
  return rows.map((row) => ({
    id: row.id!,
    notebookId: row.notebookId,
    episodeId: row.episodeId,
    operation: row.operation,
    state: row.state,
    progress: row.progress,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    ...(row.finishedAt ? { finishedAt: row.finishedAt } : {}),
    ...(row.error ? { error: row.error } : {}),
  }));
}

export function reconcileInterruptedActivities() {
  const timestamp = now();
  const result = db
    .prepare(
      `UPDATE generation_activity
       SET state = 'interrupted',
           updated_at = ?,
           finished_at = ?,
           error = CASE
             WHEN error IS NULL OR error = ''
               THEN 'Generation was interrupted when SenniBook stopped.'
             ELSE error
           END
       WHERE state = 'running'`,
    )
    .run(timestamp, timestamp);
  return Number(result.changes || 0);
}
