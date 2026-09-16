import { createHash, randomUUID } from "node:crypto";
import { db } from "./store.ts";
import { getVault, readVaultNote, scanVault } from "./vault.ts";
import type {
  VaultEmbeddingProvider,
  VaultEmbeddingIdentity,
  VaultSemanticIndex,
  VaultSemanticSearchResponse,
  VaultSemanticStatus,
  VaultSemanticPreference,
} from "../shared/vault-semantic.ts";

const CHUNK_SIZE = 1400,
  CHUNK_OVERLAP = 220,
  BATCH = 16,
  MAX_RESULTS = 50;
const MAX_INDEX_BYTES = 32 * 1024 * 1024;
const MAX_INDEX_CHUNKS = 20000;
db.exec(`CREATE TABLE IF NOT EXISTS vault_semantic_chunks (vault_id TEXT NOT NULL,path TEXT NOT NULL,chunk_id INTEGER NOT NULL,revision TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,vector BLOB NOT NULL,dimension INTEGER NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,version TEXT NOT NULL,PRIMARY KEY(vault_id,path,chunk_id));
CREATE TABLE IF NOT EXISTS vault_semantic_staging (run_id TEXT NOT NULL,vault_id TEXT NOT NULL,path TEXT NOT NULL,chunk_id INTEGER NOT NULL,revision TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,start_offset INTEGER NOT NULL,end_offset INTEGER NOT NULL,vector BLOB NOT NULL,dimension INTEGER NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,version TEXT NOT NULL,PRIMARY KEY(run_id,path,chunk_id));
CREATE TABLE IF NOT EXISTS vault_semantic_status(vault_id TEXT PRIMARY KEY,body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vault_semantic_preferences(vault_id TEXT PRIMARY KEY,mode TEXT NOT NULL CHECK(mode IN ('lexical','local','openrouter')));
CREATE INDEX IF NOT EXISTS vault_semantic_chunks_identity ON vault_semantic_chunks(vault_id,provider,model,version);`);
type Run = {
  cancelled: boolean;
  controller: AbortController;
  task: Promise<void> | null;
};
const runs = new Map<string, Run>();
const emptyStatus = (): VaultSemanticStatus => ({
  running: false,
  cancelling: false,
  completed: 0,
  total: 0,
  updatedAt: null,
  identity: null,
  error: null,
});
function readStatus(id: string) {
  const row = db
    .prepare("SELECT body FROM vault_semantic_status WHERE vault_id=?")
    .get(id) as { body: string } | undefined;
  try {
    const status = row
      ? (JSON.parse(row.body) as VaultSemanticStatus)
      : emptyStatus();
    return status.running && !runs.has(id)
      ? {
          ...status,
          running: false,
          cancelling: false,
          error: "Indexing was interrupted. Build the index again to resume.",
        }
      : status;
  } catch {
    return emptyStatus();
  }
}
function writeStatus(id: string, status: VaultSemanticStatus) {
  db.prepare(
    "INSERT INTO vault_semantic_status(vault_id,body) VALUES(?,?) ON CONFLICT(vault_id) DO UPDATE SET body=excluded.body",
  ).run(id, JSON.stringify(status));
}
function identity(p: VaultEmbeddingProvider): VaultEmbeddingIdentity {
  return {
    provider: p.provider,
    model: p.model,
    version: p.version,
    kind: p.kind,
  };
}
function hash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
function split(text: string) {
  const out: Array<{ text: string; start: number; end: number }> = [];
  for (let start = 0; start < text.length;) {
    const end = Math.min(text.length, start + CHUNK_SIZE);
    out.push({ text: text.slice(start, end), start, end });
    if (end === text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return out;
}
function toBuffer(values: number[]) {
  const b = Buffer.allocUnsafe(values.length * 4);
  values.forEach((v, i) => b.writeFloatLE(v, i * 4));
  return b;
}
function fromBuffer(value: Buffer, dimension: number) {
  const b = Buffer.from(value);
  const out = new Array<number>(dimension);
  for (let i = 0; i < dimension; i++) out[i] = b.readFloatLE(i * 4);
  return out;
}
function cosine(a: number[], b: number[]) {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function checkVectors(vectors: number[][], count: number, dimension?: number) {
  if (vectors.length !== count || !vectors.length)
    throw new Error("Embedding provider returned an invalid vector batch.");
  const d = dimension ?? vectors[0].length;
  if (
    !d ||
    d > 4096 ||
    vectors.some(
      (v) =>
        v.length !== d ||
        v.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e10) ||
        !v.some((n) => n !== 0),
    )
  )
    throw new Error(
      "Embedding provider returned vectors with inconsistent dimensions.",
    );
  return d;
}
export function setVaultSemanticPreference(
  id: string,
  mode: VaultSemanticPreference,
) {
  getVault(id);
  db.prepare(
    "INSERT INTO vault_semantic_preferences(vault_id,mode) VALUES(?,?) ON CONFLICT(vault_id) DO UPDATE SET mode=excluded.mode",
  ).run(id, mode);
}
export function getVaultSemanticPreference(
  id: string,
): VaultSemanticPreference {
  getVault(id);
  return (
    (
      db
        .prepare("SELECT mode FROM vault_semantic_preferences WHERE vault_id=?")
        .get(id) as { mode: VaultSemanticPreference } | undefined
    )?.mode || "lexical"
  );
}
export function getVaultSemanticIndex(
  id: string,
  provider?: VaultEmbeddingProvider,
): VaultSemanticIndex {
  getVault(id);
  const stored = readStatus(id);
  const matching =
    !provider ||
    (!!stored.identity &&
      stored.identity.provider === provider.provider &&
      stored.identity.model === provider.model &&
      stored.identity.version === provider.version);
  const status = matching
    ? stored
    : {
        ...stored,
        updatedAt: null,
        identity: null,
        error:
          stored.error ||
          (stored.updatedAt
            ? "Build an index for the selected search model."
            : null),
      };
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM vault_semantic_chunks WHERE vault_id=?",
    )
    .get(id) as { count: number };
  return { status, chunkCount: Number(row.count) };
}
export async function cancelVaultSemanticIndex(id: string) {
  const run = runs.get(id);
  if (run) {
    run.cancelled = true;
    run.controller.abort();
    writeStatus(id, { ...readStatus(id), cancelling: true });
    await run.task;
  }
}
export async function buildVaultSemanticIndex(
  id: string,
  provider: VaultEmbeddingProvider,
  options: { allowCloud?: boolean } = {},
) {
  getVault(id);
  const mode = getVaultSemanticPreference(id);
  if (mode === "lexical")
    throw new Error(
      "Choose local or OpenRouter embeddings for this vault first.",
    );
  if (mode === "local" && provider.kind !== "local")
    throw new Error("This vault requires a local embedding provider.");
  if (mode === "openrouter" && provider.kind !== "cloud")
    throw new Error("This vault requires the OpenRouter embedding provider.");
  if (provider.kind === "cloud" && !options.allowCloud)
    throw new Error(
      "Cloud indexing requires explicit consent; note text would leave this computer.",
    );
  const existing = runs.get(id);
  if (existing?.task) return getVaultSemanticIndex(id, provider);
  const run: Run = {
    cancelled: false,
    controller: new AbortController(),
    task: null,
  };
  runs.set(id, run);
  const runId = randomUUID();
  const ident = identity(provider);
  writeStatus(id, {
    ...readStatus(id),
    running: true,
    cancelling: false,
    completed: 0,
    total: 0,
    error: null,
  });
  run.task = (async () => {
    try {
      const files = await scanVault(id);
      if (run.cancelled) throw new DOMException("cancelled", "AbortError");
      if (files.warnings.length)
        throw new Error(
          `The vault scan is incomplete. Resolve these issues before indexing: ${files.warnings.slice(0, 3).join(" ")}`,
        );
      if (
        files.files.reduce((sum, file) => sum + file.bytes, 0) > MAX_INDEX_BYTES
      )
        throw new Error(
          "This vault exceeds the 32 MB text limit for semantic indexing. Name and keyword search remain available.",
        );
      db.prepare("DELETE FROM vault_semantic_staging WHERE vault_id=?").run(id);
      const old = readStatus(id);
      writeStatus(id, {
        running: true,
        cancelling: false,
        completed: 0,
        total: files.files.length,
        updatedAt: old.updatedAt,
        identity: ident,
        error: null,
      });
      const cached = new Map(
        (
          db
            .prepare(
              "SELECT path,revision,provider,model,version FROM vault_semantic_chunks WHERE vault_id=? GROUP BY path",
            )
            .all(id) as Array<{
            path: string;
            revision: string;
            provider: string;
            model: string;
            version: string;
          }>
        ).map((x) => [x.path, x]),
      );
      const seen = new Set<string>();
      let totalChunks = 0;
      let indexDimension: number | undefined;
      for (let completed = 0; completed < files.files.length; completed++) {
        if (run.cancelled) throw new DOMException("cancelled", "AbortError");
        const file = files.files[completed];
        const note = await readVaultNote(id, file.path);
        const revision = note.note.revision || hash(note.note.text);
        const parts = split(note.note.text);
        totalChunks += parts.length;
        if (totalChunks > MAX_INDEX_CHUNKS)
          throw new Error(
            "This vault exceeds the 20,000-passage semantic index limit. Name and keyword search remain available.",
          );
        seen.add(file.path);
        const oldRow = cached.get(file.path);
        if (
          oldRow?.revision === revision &&
          oldRow.provider === ident.provider &&
          oldRow.model === ident.model &&
          oldRow.version === ident.version
        ) {
          writeStatus(id, { ...readStatus(id), completed: completed + 1 });
          continue;
        }
        db.prepare(
          "DELETE FROM vault_semantic_staging WHERE run_id=? AND path=?",
        ).run(runId, file.path);
        for (let offset = 0; offset < parts.length; offset += BATCH) {
          if (run.cancelled) throw new DOMException("cancelled", "AbortError");
          const batch = parts.slice(offset, offset + BATCH);
          const vectors = await provider.embed({
            texts: batch.map((x) => x.text),
            signal: run.controller.signal,
            kind: "passage",
          });
          if (run.cancelled) throw new DOMException("cancelled", "AbortError");
          indexDimension = checkVectors(vectors, batch.length, indexDimension);
          const insert = db.prepare(
            "INSERT INTO vault_semantic_staging(run_id,vault_id,path,chunk_id,revision,title,text,start_offset,end_offset,vector,dimension,provider,model,version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          );
          batch.forEach((part, i) =>
            insert.run(
              runId,
              id,
              file.path,
              offset + i,
              revision,
              file.title || file.path,
              part.text,
              part.start,
              part.end,
              toBuffer(vectors[i]),
              indexDimension!,
              ident.provider,
              ident.model,
              ident.version,
            ),
          );
        }
        const current = await readVaultNote(id, file.path);
        if (run.cancelled) throw new DOMException("cancelled", "AbortError");
        if (current.note.revision !== revision)
          throw new Error(
            `Note changed while indexing: ${file.path}. Refresh and try again.`,
          );
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "DELETE FROM vault_semantic_chunks WHERE vault_id=? AND path=?",
          ).run(id, file.path);
          db.prepare(
            "INSERT INTO vault_semantic_chunks SELECT vault_id,path,chunk_id,revision,title,text,start_offset,end_offset,vector,dimension,provider,model,version FROM vault_semantic_staging WHERE run_id=? AND vault_id=? AND path=?",
          ).run(runId, id, file.path);
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        db.prepare(
          "DELETE FROM vault_semantic_staging WHERE run_id=? AND path=?",
        ).run(runId, file.path);
        writeStatus(id, { ...readStatus(id), completed: completed + 1 });
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const rows = db
        .prepare(
          "SELECT path FROM vault_semantic_chunks WHERE vault_id=? GROUP BY path",
        )
        .all(id) as Array<{ path: string }>;
      if (run.cancelled) throw new DOMException("cancelled", "AbortError");
      for (const row of rows)
        if (!seen.has(row.path))
          db.prepare(
            "DELETE FROM vault_semantic_chunks WHERE vault_id=? AND path=?",
          ).run(id, row.path);
      db.prepare("DELETE FROM vault_semantic_staging WHERE run_id=?").run(
        runId,
      );
      writeStatus(id, {
        ...readStatus(id),
        running: false,
        cancelling: false,
        updatedAt: new Date().toISOString(),
        error: null,
      });
    } catch (error) {
      db.prepare("DELETE FROM vault_semantic_staging WHERE run_id=?").run(
        runId,
      );
      const cancelled =
        error instanceof DOMException && error.name === "AbortError";
      writeStatus(id, {
        ...readStatus(id),
        running: false,
        cancelling: false,
        error: cancelled
          ? "Indexing cancelled."
          : error instanceof Error
            ? error.message
            : "Semantic indexing failed.",
      });
    } finally {
      runs.delete(id);
    }
  })();
  return getVaultSemanticIndex(id, provider);
}
export async function searchVaultSemantic(
  id: string,
  query: string,
  provider: VaultEmbeddingProvider,
  limit = 20,
  signal?: AbortSignal,
): Promise<VaultSemanticSearchResponse> {
  getVault(id);
  const status = readStatus(id);
  if (
    !query.trim() ||
    getVaultSemanticPreference(id) === "lexical" ||
    !status.identity ||
    status.identity.provider !== provider.provider ||
    status.identity.model !== provider.model ||
    status.identity.version !== provider.version
  )
    return { results: [], more: false, status };
  const [queryVector] = await provider.embed({
    texts: [query.trim()],
    signal,
    kind: "query",
  });
  checkVectors([queryVector], 1);
  type Candidate = {
    rowid: number;
    path: string;
    revision: string;
    score: number;
  };
  const bestByPath = new Map<string, Candidate>();
  let cursor = 0,
    scanned = 0;
  while (true) {
    signal?.throwIfAborted();
    if (
      getVaultSemanticPreference(id) !==
      (provider.kind === "local" ? "local" : "openrouter")
    )
      throw new Error(
        "Search mode changed. Search again with the selected mode.",
      );
    const rows = db
      .prepare(
        "SELECT rowid,path,revision,vector,dimension FROM vault_semantic_chunks WHERE vault_id=? AND provider=? AND model=? AND version=? AND rowid>? ORDER BY rowid LIMIT 128",
      )
      .all(
        id,
        provider.provider,
        provider.model,
        provider.version,
        cursor,
      ) as Array<{
      rowid: number;
      path: string;
      revision: string;
      vector: Uint8Array;
      dimension: number;
    }>;
    if (!rows.length) break;
    for (const row of rows) {
      if (
        row.dimension !== queryVector.length ||
        row.vector.byteLength !== row.dimension * 4
      )
        throw new Error(
          "The search index dimensions changed. Rebuild this vault's index.",
        );
      const score = cosine(
        queryVector,
        fromBuffer(Buffer.from(row.vector), row.dimension),
      );
      if (!Number.isFinite(score))
        throw new Error(
          "The search index contains invalid vectors. Rebuild it.",
        );
      const previous = bestByPath.get(row.path);
      if (!previous || previous.score < score)
        bestByPath.set(row.path, {
          rowid: row.rowid,
          path: row.path,
          revision: row.revision,
          score,
        });
    }
    scanned += rows.length;
    if (scanned > MAX_INDEX_CHUNKS)
      throw new Error(
        "This search index is larger than the supported limit. Rebuild it.",
      );
    cursor = Number(rows.at(-1)!.rowid);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  const ranked = [...bestByPath.values()].sort((a, b) => b.score - a.score);
  const results = [];
  for (const row of ranked) {
    signal?.throwIfAborted();
    if (results.length >= Math.min(MAX_RESULTS, limit)) break;
    try {
      if ((await readVaultNote(id, row.path)).note.revision === row.revision) {
        const passage = db
          .prepare(
            "SELECT title,text,start_offset AS start,end_offset AS end,revision FROM vault_semantic_chunks WHERE rowid=? AND vault_id=?",
          )
          .get(row.rowid, id) as
          | {
              title: string;
              text: string;
              start: number;
              end: number;
              revision: string;
            }
          | undefined;
        if (!passage || passage.revision !== row.revision) continue;
        results.push({
          path: row.path,
          title: passage.title,
          text: passage.text,
          start: passage.start,
          end: passage.end,
          revision: row.revision,
          score: row.score,
        });
      }
    } catch {
      /* removed notes are not citations */
    }
  }
  return { results, more: ranked.length > results.length, status };
}

export function stopVaultSemanticWork() {
  for (const run of runs.values()) {
    run.cancelled = true;
    run.controller.abort();
  }
}
