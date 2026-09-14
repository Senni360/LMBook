import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { settingsSchema, uid, type Notebook } from "../shared/model.ts";

export const dataDir = path.resolve(process.env.DATA_DIR || "data");
mkdirSync(dataDir, { recursive: true });
export const audioDir = path.join(dataDir, "audio");
mkdirSync(audioDir, { recursive: true });
export const originalsDir = path.join(dataDir, "originals");
mkdirSync(originalsDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, "sennibook.sqlite"));
db.exec(
  "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS notebooks (id TEXT PRIMARY KEY, body TEXT NOT NULL)",
);
export function listNotebooks(): Notebook[] {
  return (db.prepare("SELECT body FROM notebooks").all() as { body: string }[])
    .map((r) => normalizeNotebook(JSON.parse(r.body)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    episode.settings = settingsSchema.parse(episode.settings);
  return notebook;
}
export function saveNotebook(n: Notebook) {
  n.updatedAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO notebooks VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body",
  ).run(n.id, JSON.stringify(n));
  return n;
}
export function removeNotebook(id: string) {
  db.prepare("DELETE FROM notebooks WHERE id = ?").run(id);
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
