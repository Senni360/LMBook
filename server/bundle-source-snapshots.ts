import { createHash } from "node:crypto";
import type { Notebook, Source } from "../shared/model.ts";

export const MAX_SOURCE_SNAPSHOT_BYTES = 32 * 1024 * 1024;
/** Bounded unique source arrays across current, episode, and chat history. */
export const MAX_SOURCE_SET_COUNT = 512;
export const MAX_EXPANDED_SOURCE_BYTES = 128 * 1024 * 1024;
export const MAX_SOURCES_PER_SET = 150;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export type SourceSnapshotWireEpisode = Omit<
  Notebook["episodes"][number],
  "sources"
> & { sourceRef?: string };
export type SourceSnapshotWireMessage = Omit<
  Notebook["messages"][number],
  "sources"
> & { sourceRef?: string };

export type SourceSnapshotWireNotebook = Omit<
  Notebook,
  "sources" | "episodes" | "messages"
> & {
  sourceRef: string;
  episodes: SourceSnapshotWireEpisode[];
  messages: SourceSnapshotWireMessage[];
};

export type SourceSnapshotEntry = {
  path: string;
  kind: "source-snapshot";
  size: number;
  sha256: string;
  content: Buffer;
};

export type SourceSnapshotEntryInput = {
  path: string;
  kind: string;
  size: number;
  sha256?: string;
  content: Uint8Array;
};

export type SourceArrayValidator = (raw: unknown, context: string) => Source[];

export type EncodedSourceSnapshots = {
  notebook: SourceSnapshotWireNotebook;
  entries: SourceSnapshotEntry[];
};

function sizeLabel(bytes: number) {
  return `${bytes} bytes (${(bytes / (1024 * 1024)).toFixed(3)} MiB)`;
}

function failSize(kind: string, actual: number, maximum: number): never {
  throw new Error(
    `${kind} is ${sizeLabel(actual)}; maximum is ${sizeLabel(maximum)}.`,
  );
}

/** Stable JSON for JSON-compatible source records; array order is preserved. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
      throw new Error("Source snapshot contains undefined JSON data.");
    return encoded;
  }
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function sourceArrayHash(sources: Source[]) {
  return createHash("sha256").update(canonicalJson(sources)).digest("hex");
}

function checkedSourceArray(
  sources: Source[],
  context: string,
  validateSources?: SourceArrayValidator,
) {
  const checked = validateSources ? validateSources(sources, context) : sources;
  if (!Array.isArray(checked) || checked.length > MAX_SOURCES_PER_SET)
    throw new Error(
      `${context} contains ${Array.isArray(checked) ? checked.length : "an invalid number of"} sources; maximum is ${MAX_SOURCES_PER_SET}.`,
    );
  return checked;
}

function snapshotRecord(
  sources: Source[],
  context: string,
): { hash: string; bytes: number; content: Buffer } {
  const content = Buffer.from(canonicalJson(sources), "utf8");
  const bytes = content.byteLength;
  if (bytes > MAX_SOURCE_SNAPSHOT_BYTES)
    failSize(`Source snapshot ${context}`, bytes, MAX_SOURCE_SNAPSHOT_BYTES);
  const hash = createHash("sha256").update(content).digest("hex");
  return {
    hash,
    bytes,
    content,
  };
}

function checkExpandedSourceBytes(bytes: number) {
  if (bytes > MAX_EXPANDED_SOURCE_BYTES)
    failSize("Expanded source snapshots", bytes, MAX_EXPANDED_SOURCE_BYTES);
}

/**
 * Replace current, explicit episode, and historical chat source arrays with
 * content hashes. Arrays are hashed in full, so equal IDs with changed
 * content never collide.
 */
export function encodeSourceSnapshots(
  notebook: Notebook,
  options: { validateSources?: SourceArrayValidator } = {},
): EncodedSourceSnapshots {
  const records = new Map<string, { bytes: number; content: Buffer }>();
  const add = (sources: Source[], context: string) => {
    const checked = checkedSourceArray(
      sources,
      context,
      options.validateSources,
    );
    const record = snapshotRecord(checked, context);
    if (!records.has(record.hash))
      records.set(record.hash, {
        bytes: record.bytes,
        content: record.content,
      });
    return record;
  };

  const current = add(notebook.sources, "current sources");
  // `records` counts unique content-addressed sets; `expandedBytes` counts
  // every reference occurrence, including repeated chat snapshots.
  let expandedBytes = current.bytes;
  const episodes = notebook.episodes.map((episode, index) => {
    const wireEpisode = { ...episode } as SourceSnapshotWireEpisode & {
      sources?: Source[];
    };
    delete wireEpisode.sources;
    if (!Array.isArray(episode.sources)) return wireEpisode;
    const snapshot = add(episode.sources, `episode ${index + 1} sources`);
    expandedBytes += snapshot.bytes;
    checkExpandedSourceBytes(expandedBytes);
    wireEpisode.sourceRef = snapshot.hash;
    return wireEpisode;
  });
  const messages = notebook.messages.map((message, index) => {
    const wireMessage = { ...message } as SourceSnapshotWireMessage & {
      sources?: Source[];
    };
    delete wireMessage.sources;
    if (!Array.isArray(message.sources)) return wireMessage;
    const snapshot = add(message.sources, `chat message ${index + 1} sources`);
    expandedBytes += snapshot.bytes;
    checkExpandedSourceBytes(expandedBytes);
    wireMessage.sourceRef = snapshot.hash;
    return wireMessage;
  });
  checkExpandedSourceBytes(expandedBytes);
  if (records.size > MAX_SOURCE_SET_COUNT)
    throw new Error(
      `Notebook contains ${records.size} distinct source histories; backups support at most ${MAX_SOURCE_SET_COUNT}. Reduce historical chat/source history or export a smaller notebook.`,
    );

  const entries = [...records.entries()].map(([hash, record]) => ({
    path: `sources/${hash}.json`,
    kind: "source-snapshot" as const,
    size: record.bytes,
    sha256: hash,
    content: record.content,
  }));
  const wireNotebook = {
    ...notebook,
    sourceRef: current.hash,
    episodes,
    messages,
  } as SourceSnapshotWireNotebook;
  delete (wireNotebook as SourceSnapshotWireNotebook & { sources?: Source[] })
    .sources;
  return { notebook: wireNotebook, entries };
}

function objectRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${context} must be an object.`);
  return value as Record<string, unknown>;
}

function sourceRef(value: unknown, context: string) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value))
    throw new Error(`${context} has an invalid source snapshot hash.`);
  return value;
}

function parseSnapshotEntry(
  entry: SourceSnapshotEntryInput,
  validateSources: SourceArrayValidator,
) {
  if (entry.kind !== "source-snapshot")
    throw new Error(`Unexpected source snapshot entry kind: ${entry.kind}.`);
  const match = /^sources\/([a-f0-9]{64})\.json$/u.exec(entry.path);
  if (!match || entry.sha256 !== match[1])
    throw new Error(
      `Invalid source snapshot entry path or hash: ${entry.path}.`,
    );
  if (!Number.isSafeInteger(entry.size) || entry.size < 0)
    throw new Error(`Invalid source snapshot size: ${entry.path}.`);
  if (entry.size > MAX_SOURCE_SNAPSHOT_BYTES)
    failSize(
      `Source snapshot ${entry.path}`,
      entry.size,
      MAX_SOURCE_SNAPSHOT_BYTES,
    );
  const content = Buffer.from(entry.content);
  if (content.byteLength !== entry.size)
    throw new Error(
      `Source snapshot ${entry.path} has ${sizeLabel(content.byteLength)}; manifest declares ${sizeLabel(entry.size)}.`,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error(`Source snapshot ${entry.path} is not valid JSON.`);
  }
  const sources = checkedSourceArray(
    raw as Source[],
    entry.path,
    validateSources,
  );
  const canonical = snapshotRecord(sources, entry.path);
  if (canonical.hash !== match[1])
    throw new Error(
      `Source snapshot ${entry.path} hash mismatch: computed ${canonical.hash}.`,
    );
  return { hash: match[1], sources, bytes: canonical.bytes };
}

/**
 * Validate source entries and expand a v3 wire notebook. The returned object
 * is intentionally unknown: the caller applies the authoritative notebook
 * schema after this source-specific validation.
 */
export function decodeSourceSnapshots(
  wireNotebook: unknown,
  entries: readonly SourceSnapshotEntryInput[],
  validateSources: SourceArrayValidator,
): unknown {
  const wire = objectRecord(wireNotebook, "Bundle notebook");
  const currentRef = sourceRef(wire.sourceRef, "Bundle notebook");
  if (Object.prototype.hasOwnProperty.call(wire, "sources"))
    throw new Error(
      "v3 bundle notebook must use sourceRef instead of sources.",
    );
  if (!Array.isArray(wire.episodes))
    throw new Error("v3 bundle notebook episodes must be an array.");
  if (wire.episodes.length > 100)
    throw new Error(
      `Bundle contains ${wire.episodes.length} episodes; maximum is 100.`,
    );
  if (!Array.isArray(wire.messages))
    throw new Error("Bundle notebook messages must be an array.");
  if (wire.messages.length > 1000)
    throw new Error(
      `Bundle contains ${wire.messages.length} messages; maximum is 1000.`,
    );

  const snapshots = new Map<string, { sources: Source[]; bytes: number }>();
  if (entries.length > MAX_SOURCE_SET_COUNT)
    throw new Error(
      `Bundle contains ${entries.length} distinct source histories; maximum is ${MAX_SOURCE_SET_COUNT}.`,
    );
  // Archive entries are unique sets. Expanded bytes below account for every
  // current/episode/message reference to those sets.
  let declaredBytes = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.size) || entry.size < 0)
      throw new Error(`Invalid source snapshot size: ${entry.path}.`);
    declaredBytes += entry.size;
    checkExpandedSourceBytes(declaredBytes);
  }
  for (const entry of entries) {
    const parsed = parseSnapshotEntry(entry, validateSources);
    if (snapshots.has(parsed.hash))
      throw new Error(`Duplicate source snapshot entry: ${parsed.hash}.`);
    snapshots.set(parsed.hash, {
      sources: parsed.sources,
      bytes: parsed.bytes,
    });
  }
  if (snapshots.size > MAX_SOURCE_SET_COUNT)
    throw new Error(
      `Bundle contains ${snapshots.size} distinct source histories; maximum is ${MAX_SOURCE_SET_COUNT}.`,
    );
  if (!snapshots.has(currentRef))
    throw new Error(
      `Bundle references missing current source snapshot: ${currentRef}.`,
    );

  const used = new Set<string>([currentRef]);
  let expandedBytes = snapshots.get(currentRef)!.bytes;
  for (const [index, episodeValue] of wire.episodes.entries()) {
    const episode = objectRecord(episodeValue, `Episode ${index + 1}`);
    if (Object.prototype.hasOwnProperty.call(episode, "sources"))
      throw new Error(
        `Episode ${index + 1} must use sourceRef instead of sources.`,
      );
    if (!Object.prototype.hasOwnProperty.call(episode, "sourceRef")) continue;
    const ref = sourceRef(episode.sourceRef, `Episode ${index + 1}`);
    const snapshot = snapshots.get(ref);
    if (!snapshot)
      throw new Error(
        `Episode ${index + 1} references missing source snapshot: ${ref}.`,
      );
    used.add(ref);
    expandedBytes += snapshot.bytes;
  }
  for (const [index, messageValue] of wire.messages.entries()) {
    const message = objectRecord(messageValue, `Message ${index + 1}`);
    if (Object.prototype.hasOwnProperty.call(message, "sources"))
      throw new Error(
        `Message ${index + 1} must use sourceRef instead of sources.`,
      );
    if (!Object.prototype.hasOwnProperty.call(message, "sourceRef")) continue;
    const ref = sourceRef(message.sourceRef, `Message ${index + 1}`);
    const snapshot = snapshots.get(ref);
    if (!snapshot)
      throw new Error(
        `Message ${index + 1} references missing source snapshot: ${ref}.`,
      );
    used.add(ref);
    expandedBytes += snapshot.bytes;
  }
  for (const hash of snapshots.keys())
    if (!used.has(hash))
      throw new Error(`Bundle contains unused source snapshot: ${hash}.`);
  checkExpandedSourceBytes(expandedBytes);

  const sources = structuredClone(snapshots.get(currentRef)!.sources);
  const episodes = wire.episodes.map((episodeValue, index) => {
    const episode = objectRecord(episodeValue, `Episode ${index + 1}`);
    if (!Object.prototype.hasOwnProperty.call(episode, "sourceRef"))
      return { ...episode };
    const ref = sourceRef(episode.sourceRef, `Episode ${index + 1}`);
    const restored: Record<string, unknown> = {
      ...episode,
      sources: structuredClone(snapshots.get(ref)!.sources),
    };
    delete restored.sourceRef;
    return restored;
  });
  const messages = wire.messages.map((messageValue, index) => {
    const message = objectRecord(messageValue, `Message ${index + 1}`);
    if (!Object.prototype.hasOwnProperty.call(message, "sourceRef"))
      return { ...message };
    const ref = sourceRef(message.sourceRef, `Message ${index + 1}`);
    const restored: Record<string, unknown> = {
      ...message,
      sources: structuredClone(snapshots.get(ref)!.sources),
    };
    delete restored.sourceRef;
    return restored;
  });
  const expanded: Record<string, unknown> = {
    ...wire,
    sources,
    episodes,
    messages,
  };
  delete expanded.sourceRef;
  return expanded;
}
