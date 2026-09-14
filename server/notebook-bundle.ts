import { ZipArchive } from "archiver";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { randomUUID } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  settingsSchema,
  sourceAttachmentSchema,
  type Notebook,
  type SourceAttachment,
} from "../shared/model.ts";
import { transcriptSchema } from "../shared/transcription.ts";
import { contextSummarySchema } from "../shared/context-summary.ts";
import { savedEpisodeSettingsSchema } from "../shared/speech.ts";
import { ocrResultSchema } from "../shared/ocr.ts";
import { validateWavFile } from "./audio-export.ts";
import {
  hashOriginal,
  storeOriginal,
  verifyOriginal,
} from "./source-originals.ts";
import {
  decodeSourceSnapshots,
  encodeSourceSnapshots,
  MAX_EXPANDED_SOURCE_BYTES,
  MAX_SOURCE_SET_COUNT,
  MAX_SOURCE_SNAPSHOT_BYTES,
  type SourceSnapshotWireNotebook,
} from "./bundle-source-snapshots.ts";

const BUNDLE_VERSION = 2;
const NOTEBOOK_ENTRY = "notebook.json";
const MAX_NOTEBOOK_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 500 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_CACHE_MANIFEST_BYTES = 1024 * 1024;
const UUID = z.string().uuid();

type BundleEntryKind =
  | "final"
  | "preview"
  | "segment"
  | "cache-manifest"
  | "original"
  | "source-snapshot";
type BundleEntry = {
  path: string;
  kind: BundleEntryKind;
  size: number;
  episodeId?: string;
  chapterId?: string;
  index?: number;
  sha256?: string;
};

type BundleManifestBase = {
  format: "sennibook-notebook";
  entries: BundleEntry[];
};
type NormalBundleManifest = BundleManifestBase & {
  version: 1 | 2;
  notebook: Notebook;
};
type V3BundleManifest = BundleManifestBase & {
  version: 3;
  notebook: SourceSnapshotWireNotebook;
};
type BundleManifest = NormalBundleManifest | V3BundleManifest;

export type NotebookBundleImport = {
  notebook: Notebook;
  /** Files moved into audioDir. Call cleanup if persistence fails afterwards. */
  createdFiles: string[];
  cleanup: () => Promise<void>;
};

export type BundleOptions = { signal?: AbortSignal; originalsDir?: string };

const sourceSchema = z
  .object({
    id: UUID,
    title: z.string().max(500),
    text: z.string().max(20_000_000),
    kind: z.enum(["course", "supplement"]),
    filename: z.string().max(500).optional(),
    originalSha256: z.string().max(128).optional(),
    extractedSha256: z.string().max(128).optional(),
    extraction: z.string().max(1000).optional(),
    extractionWarnings: z.array(z.string().max(2000)).max(100).optional(),
    attachment: sourceAttachmentSchema.optional(),
    ocr: ocrResultSchema.optional(),
    ocrCandidate: z.boolean().optional(),
    transcript: transcriptSchema.optional(),
    processing: z
      .object({
        task: z.enum(["ocr", "transcription"]).optional(),
        status: z.enum(["pending", "recognizing", "transcribing", "failed"]),
        progress: z.string().max(1000).optional(),
        error: z.string().max(5000).optional(),
      })
      .strict()
      .optional(),
    createdAt: z.string().max(100),
  })
  .strict();
const objectiveSchema = z
  .object({
    id: UUID,
    text: z.string().min(1).max(5000),
    kind: z.enum(["goal", "concept"]),
    important: z.boolean(),
  })
  .strict();
const evidenceSchema = z
  .object({ sourceId: UUID, quote: z.string().max(20_000) })
  .strict();
const coverageSchema = z
  .object({
    context: contextSummarySchema.optional(),
    objectiveId: UUID,
    status: z.enum(["covered", "partial", "missing"]),
    explanation: z.string().max(20_000),
    evidence: z.array(evidenceSchema).max(100),
    searchQuery: z.string().max(5000),
  })
  .strict();
const turnSchema = z
  .object({
    speaker: z.enum(["A", "B"]),
    text: z.string().min(1).max(12_000),
    sourceIds: z.array(UUID).max(30),
  })
  .strict();
const chapterSchema = z
  .object({
    context: contextSummarySchema.optional(),
    id: UUID,
    title: z.string().min(1).max(180),
    minutes: z.number().finite().min(0).max(120),
    objectiveIds: z.array(UUID).max(200),
    summary: z.string().max(3000),
    turns: z.array(turnSchema).max(100),
    audioFile: z.string().max(300).optional(),
    audioSeconds: z
      .number()
      .finite()
      .nonnegative()
      .max(24 * 60 * 60)
      .optional(),
    audioLocked: z.boolean().optional(),
  })
  .strict();
const episodeSchema = z
  .object({
    context: contextSummarySchema.optional(),
    id: UUID,
    title: z.string().min(1).max(180),
    createdAt: z.string().max(100),
    settings: savedEpisodeSettingsSchema,
    sources: z.array(sourceSchema).max(150).optional(),
    objectives: z.array(objectiveSchema).max(150).optional(),
    previewFile: z.string().max(300).optional(),
    chapters: z.array(chapterSchema).max(100),
    status: z.enum(["draft", "script", "audio", "complete", "error"]),
    progress: z.string().max(1000),
    error: z.string().max(5000).optional(),
  })
  .strict();
const messageSchema = z
  .object({
    context: contextSummarySchema.optional(),
    id: UUID,
    role: z.enum(["user", "assistant"]),
    text: z.string().max(30_000),
    evidence: z.array(evidenceSchema).max(100).optional(),
  })
  .strict();
const notebookSchema = z
  .object({
    id: UUID,
    title: z.string().min(1).max(180),
    description: z.string().max(20_000),
    example: z.boolean(),
    createdAt: z.string().max(100),
    updatedAt: z.string().max(100),
    settings: settingsSchema,
    sources: z.array(sourceSchema).max(150),
    objectives: z.array(objectiveSchema).max(150),
    coverage: z.array(coverageSchema).max(300),
    episodes: z.array(episodeSchema).max(100),
    messages: z.array(messageSchema).max(1000),
  })
  .strict();
const bundleEntrySchema = z
  .object({
    path: z.string().min(1).max(500),
    kind: z.enum([
      "final",
      "preview",
      "segment",
      "cache-manifest",
      "original",
      "source-snapshot",
    ]),
    size: z.number().int().nonnegative().max(MAX_ENTRY_BYTES),
    episodeId: UUID.optional(),
    chapterId: UUID.optional(),
    index: z.number().int().nonnegative().max(100_000).optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict();
const manifestSchema = z
  .object({
    format: z.literal("sennibook-notebook"),
    version: z.union([z.literal(1), z.literal(2)]),
    notebook: notebookSchema,
    entries: z.array(bundleEntrySchema).max(MAX_ENTRIES),
  })
  .strict();
const sourceSnapshotHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const wireEpisodeSchema = episodeSchema
  .omit({ sources: true })
  .extend({ sourceRef: sourceSnapshotHashSchema.optional() })
  .strict();
const wireNotebookSchema = notebookSchema
  .omit({ sources: true, episodes: true })
  .extend({
    sourceRef: sourceSnapshotHashSchema,
    episodes: z.array(wireEpisodeSchema).max(100),
  })
  .strict();
const v3ManifestSchema = z
  .object({
    format: z.literal("sennibook-notebook"),
    version: z.literal(3),
    notebook: wireNotebookSchema,
    entries: z.array(bundleEntrySchema).max(MAX_ENTRIES),
  })
  .strict();

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Notebook bundle operation cancelled.");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal);
}

function duplicateIds<T extends { id: string }>(
  items: T[],
): string | undefined {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return item.id;
    seen.add(item.id);
  }
  return undefined;
}

function validateNotebookReferences(notebook: Notebook) {
  const sourceIds = new Set(notebook.sources.map((source) => source.id));
  const objectiveIds = new Set(
    notebook.objectives.map((objective) => objective.id),
  );
  const duplicateSource = duplicateIds(notebook.sources);
  const duplicateObjective = duplicateIds(notebook.objectives);
  if (duplicateSource || duplicateObjective)
    throw new Error("Notebook contains duplicate source or objective IDs.");
  const episodeIds = new Set<string>();
  const chapterIds = new Set<string>();
  for (const coverage of notebook.coverage) {
    if (!objectiveIds.has(coverage.objectiveId))
      throw new Error(
        `Coverage refers to unknown objective ${coverage.objectiveId}.`,
      );
    for (const evidence of coverage.evidence)
      if (!sourceIds.has(evidence.sourceId))
        throw new Error(
          `Coverage refers to unknown source ${evidence.sourceId}.`,
        );
  }
  // Chat quotes are historical. Removing a current source deliberately leaves
  // those quotes visible with a "source no longer available" label.

  for (const episode of notebook.episodes) {
    if (episodeIds.has(episode.id))
      throw new Error(`Notebook contains duplicate episode ID ${episode.id}.`);
    episodeIds.add(episode.id);
    const episodeSourceIds = new Set(
      (episode.sources || notebook.sources).map((source) => source.id),
    );
    const episodeObjectiveIds = new Set(
      (episode.objectives || notebook.objectives).map(
        (objective) => objective.id,
      ),
    );
    if (
      duplicateIds(episode.sources || []) ||
      duplicateIds(episode.objectives || [])
    )
      throw new Error(`Episode ${episode.id} contains duplicate snapshot IDs.`);
    for (const chapter of episode.chapters) {
      if (chapterIds.has(chapter.id))
        throw new Error(
          `Notebook contains duplicate chapter ID ${chapter.id}.`,
        );
      chapterIds.add(chapter.id);
      for (const objectiveId of chapter.objectiveIds)
        if (!episodeObjectiveIds.has(objectiveId))
          throw new Error(
            `Chapter ${chapter.id} refers to unknown objective ${objectiveId}.`,
          );
      for (const turn of chapter.turns)
        for (const sourceId of turn.sourceIds)
          if (!episodeSourceIds.has(sourceId))
            throw new Error(
              `Chapter ${chapter.id} refers to unknown source ${sourceId}.`,
            );
    }
  }
}

function validateNotebook(raw: unknown): Notebook {
  const parsed = notebookSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error("Notebook manifest has an invalid notebook schema.");
  validateNotebookReferences(parsed.data);
  return parsed.data;
}

function notebookAttachments(notebook: Notebook): SourceAttachment[] {
  return [
    ...notebook.sources,
    ...notebook.episodes.flatMap((episode) => episode.sources || []),
  ].flatMap((source) => (source.attachment ? [source.attachment] : []));
}

function attachmentMap(notebook: Notebook): Map<string, SourceAttachment> {
  const result = new Map<string, SourceAttachment>();
  for (const attachment of notebookAttachments(notebook)) {
    const parsed = sourceAttachmentSchema.parse(attachment);
    const previous = result.get(parsed.sha256);
    if (previous && previous.bytes !== parsed.bytes)
      throw new Error(
        `Source attachments for ${parsed.sha256} disagree about their size.`,
      );
    if (!previous) result.set(parsed.sha256, parsed);
  }
  return result;
}

function isSymlink(filename: string): boolean {
  try {
    return lstatSync(filename).isSymbolicLink();
  } catch {
    return false;
  }
}

function safeAudioPath(audioDir: string, filename: string): string {
  if (
    !filename ||
    filename !== path.basename(filename) ||
    filename.includes("\\") ||
    filename.includes("\0") ||
    !/^[0-9a-f-]+(?:-preview)?\.wav$/iu.test(filename)
  )
    throw new Error(`Audio filename is unsafe: ${filename}`);
  const root = path.resolve(audioDir);
  const resolved = path.resolve(root, filename);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))
    throw new Error("Audio path escapes the notebook audio directory.");
  return resolved;
}

function safeCachePath(
  audioDir: string,
  chapterId: string,
  filename: string,
): string {
  if (
    !UUID.safeParse(chapterId).success ||
    !/^(?:manifest\.json|\d+\.wav)$/u.test(filename)
  )
    throw new Error("Audio cache path is unsafe.");
  const root = path.resolve(audioDir);
  const resolved = path.resolve(root, chapterId, filename);
  if (!resolved.startsWith(`${root}${path.sep}`))
    throw new Error("Audio cache path escapes the notebook audio directory.");
  return resolved;
}

async function fileEntry(
  absolutePath: string,
  archivePath: string,
  kind: BundleEntryKind,
  meta: Omit<BundleEntry, "path" | "kind" | "size">,
): Promise<{ entry: BundleEntry; absolutePath: string }> {
  const info = await stat(absolutePath);
  if (!info.isFile() || isSymlink(absolutePath))
    throw new Error(
      `Referenced audio file is missing or is a symlink: ${archivePath}`,
    );
  if (info.size > MAX_ENTRY_BYTES)
    throw new Error(
      `Referenced audio file exceeds the ${MAX_ENTRY_BYTES} byte limit.`,
    );
  if (kind === "cache-manifest" && info.size > MAX_CACHE_MANIFEST_BYTES)
    throw new Error("Audio cache manifest is too large.");
  if (kind !== "cache-manifest") await validateWavFile(absolutePath);
  return {
    absolutePath,
    entry: { ...meta, path: archivePath, kind, size: info.size },
  };
}

async function buildAudioPlan(
  notebook: Notebook,
  audioDir: string,
): Promise<Array<{ entry: BundleEntry; absolutePath: string }>> {
  const result: Array<{ entry: BundleEntry; absolutePath: string }> = [];
  const chapterIds = new Set(
    notebook.episodes.flatMap((episode) =>
      episode.chapters.map((chapter) => chapter.id),
    ),
  );
  for (const episode of notebook.episodes) {
    for (const chapter of episode.chapters) {
      if (chapter.audioFile) {
        const filename = chapter.audioFile;
        const absolutePath = safeAudioPath(audioDir, filename);
        result.push(
          await fileEntry(
            absolutePath,
            `audio/final/${episode.id}/${filename}`,
            "final",
            { episodeId: episode.id, chapterId: chapter.id },
          ),
        );
      }
    }
    if (episode.previewFile) {
      const filename = episode.previewFile;
      const chapter = episode.chapters.find(
        (candidate) => `${candidate.id}-preview.wav` === filename,
      );
      if (!chapter)
        throw new Error(
          `Preview file ${filename} is not tied to a chapter in episode ${episode.id}.`,
        );
      const absolutePath = safeAudioPath(audioDir, filename);
      result.push(
        await fileEntry(
          absolutePath,
          `audio/preview/${episode.id}/${filename}`,
          "preview",
          { episodeId: episode.id, chapterId: chapter.id },
        ),
      );
    }
    for (const chapter of episode.chapters) {
      if (!chapterIds.has(chapter.id)) continue;
      const cacheDir = path.resolve(audioDir, chapter.id);
      if (!existsSync(cacheDir)) continue;
      if (isSymlink(cacheDir))
        throw new Error(`Audio cache directory is a symlink: ${chapter.id}`);
      const names = await readdir(cacheDir, { withFileTypes: true });
      for (const item of names) {
        if (item.isSymbolicLink())
          throw new Error(
            `Audio cache contains a symlink: ${chapter.id}/${item.name}`,
          );
        if (!item.isFile() || !/^(?:manifest\.json|\d+\.wav)$/u.test(item.name))
          continue;
        const absolutePath = safeCachePath(audioDir, chapter.id, item.name);
        const kind: BundleEntryKind =
          item.name === "manifest.json" ? "cache-manifest" : "segment";
        const index =
          kind === "segment" ? Number(item.name.slice(0, -4)) : undefined;
        result.push(
          await fileEntry(
            absolutePath,
            `audio/cache/${chapter.id}/${item.name}`,
            kind,
            {
              episodeId: episode.id,
              chapterId: chapter.id,
              ...(index === undefined ? {} : { index }),
            },
          ),
        );
      }
    }
  }
  if (result.length > MAX_ENTRIES - 1)
    throw new Error("Notebook bundle contains too many audio entries.");
  const total = result.reduce((sum, item) => sum + item.entry.size, 0);
  if (total > MAX_TOTAL_BYTES)
    throw new Error(
      "Notebook bundle exceeds the 2 GB uncompressed audio limit.",
    );
  return result;
}

async function buildOriginalPlan(
  notebook: Notebook,
  originalsDir: string,
  signal?: AbortSignal,
): Promise<Array<{ entry: BundleEntry; absolutePath: string }>> {
  const result: Array<{ entry: BundleEntry; absolutePath: string }> = [];
  for (const attachment of attachmentMap(notebook).values()) {
    throwIfAborted(signal);
    const metadata = sourceAttachmentSchema.parse(attachment);
    const absolutePath = await verifyOriginal(originalsDir, metadata, signal);
    if (metadata.bytes > MAX_ENTRY_BYTES)
      throw new Error(
        `Original source exceeds the ${MAX_ENTRY_BYTES} byte bundle entry limit.`,
      );
    result.push({
      absolutePath,
      entry: {
        path: `originals/${metadata.sha256}`,
        kind: "original",
        size: metadata.bytes,
        sha256: metadata.sha256,
      },
    });
  }
  return result;
}

function manifestJson(manifest: BundleManifest): string {
  const json = JSON.stringify(manifest);
  if (Buffer.byteLength(json) > MAX_NOTEBOOK_BYTES)
    throw new Error("Notebook manifest exceeds the 20 MB limit.");
  return json;
}

/** Create a streamed ZIP backup. Audio payloads are read by archiver streams. */
export function createNotebookBundle(
  notebook: Notebook,
  audioDir: string,
  options: BundleOptions = {},
): Readable {
  const output = new PassThrough();
  void (async () => {
    try {
      throwIfAborted(options.signal);
      const validated = validateNotebook(notebook);
      const audio = await buildAudioPlan(validated, audioDir);
      const originals = await buildOriginalPlan(
        validated,
        options.originalsDir || path.join(path.dirname(audioDir), "originals"),
        options.signal,
      );
      const entries = [...audio, ...originals];
      const totalBytes = entries.reduce(
        (sum, item) => sum + item.entry.size,
        0,
      );
      if (entries.length > MAX_ENTRIES - 1)
        throw new Error("Notebook bundle contains too many entries.");
      if (totalBytes > MAX_TOTAL_BYTES)
        throw new Error(
          "Notebook bundle exceeds the 2 GB uncompressed size limit.",
        );
      let manifest: BundleManifest = {
        format: "sennibook-notebook",
        version: BUNDLE_VERSION,
        notebook: validated,
        entries: entries.map((item) => item.entry),
      };
      let manifestText: string;
      let sourceSnapshotContents: Map<string, Buffer> | undefined;
      const v2Text = JSON.stringify(manifest);
      if (Buffer.byteLength(v2Text) <= MAX_NOTEBOOK_BYTES)
        manifestText = v2Text;
      else {
        const snapshots = encodeSourceSnapshots(validated, {
          validateSources: (raw) => z.array(sourceSchema).max(150).parse(raw),
        });
        const sourceSnapshotBytes = snapshots.entries.reduce(
          (sum, entry) => sum + entry.size,
          0,
        );
        if (totalBytes + sourceSnapshotBytes > MAX_TOTAL_BYTES)
          throw new Error(
            "Notebook bundle exceeds the 2 GB uncompressed size limit.",
          );
        if (entries.length + snapshots.entries.length > MAX_ENTRIES - 1)
          throw new Error("Notebook bundle contains too many entries.");
        manifest = {
          format: "sennibook-notebook",
          version: 3,
          notebook: snapshots.notebook,
          entries: [
            ...entries.map((item) => item.entry),
            ...snapshots.entries.map(
              ({ content: _content, ...entry }) => entry,
            ),
          ],
        };
        manifestText = manifestJson(manifest);
        sourceSnapshotContents = new Map(
          snapshots.entries.map((entry) => [entry.path, entry.content]),
        );
      }
      throwIfAborted(options.signal);
      const sourceSnapshotBytes = [
        ...(sourceSnapshotContents?.values() || []),
      ].reduce((sum, content) => sum + content.byteLength, 0);
      if (
        totalBytes + sourceSnapshotBytes + Buffer.byteLength(manifestText) >
        MAX_TOTAL_BYTES
      )
        throw new Error(
          "Notebook bundle exceeds the 2 GB uncompressed size limit.",
        );
      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on("error", (error) => output.destroy(error));
      archive.on("warning", (error) => output.destroy(error));
      output.once("close", () => archive.abort());
      archive.pipe(output);
      archive.append(manifestText, { name: NOTEBOOK_ENTRY });
      for (const item of entries) {
        throwIfAborted(options.signal);
        archive.file(item.absolutePath, {
          name: item.entry.path,
        });
      }
      for (const [name, content] of sourceSnapshotContents ?? [])
        archive.append(content, { name });
      if (options.signal) {
        const abort = () => {
          archive.abort();
          output.destroy(new Error("Notebook backup cancelled."));
        };
        options.signal.addEventListener("abort", abort, { once: true });
        output.once("close", () =>
          options.signal?.removeEventListener("abort", abort),
        );
      }
      await archive.finalize();
    } catch (error) {
      output.destroy(error as Error);
    }
  })();
  return output;
}

function archivePathSafe(filename: string): boolean {
  if (
    !filename ||
    filename.includes("\0") ||
    filename.includes("\\") ||
    filename.startsWith("/")
  )
    return false;
  if (/^[A-Za-z]:/u.test(filename)) return false;
  const pieces = filename.split("/");
  return pieces.every((piece) => piece && piece !== "." && piece !== "..");
}

function validateBundleEntryShape(entry: BundleEntry) {
  const parts = entry.path.split("/");
  if (entry.kind === "source-snapshot") {
    if (
      parts.length !== 2 ||
      parts[0] !== "sources" ||
      !/^[a-f0-9]{64}\.json$/u.test(parts[1]) ||
      entry.sha256 !== parts[1].slice(0, -5) ||
      entry.episodeId !== undefined ||
      entry.chapterId !== undefined ||
      entry.index !== undefined
    )
      throw new Error(`Invalid source snapshot entry path: ${entry.path}`);
    return;
  }
  if (entry.kind === "original") {
    if (
      parts.length !== 2 ||
      parts[0] !== "originals" ||
      !/^[a-f0-9]{64}$/u.test(parts[1]) ||
      (entry.sha256 !== undefined && entry.sha256 !== parts[1]) ||
      entry.episodeId !== undefined ||
      entry.chapterId !== undefined ||
      entry.index !== undefined
    )
      throw new Error(`Invalid original entry path: ${entry.path}`);
    return;
  }
  if (entry.sha256 !== undefined)
    throw new Error(`Unexpected source hash on audio entry: ${entry.path}`);
  if (entry.kind === "final" || entry.kind === "preview") {
    if (parts.length !== 4 || parts[0] !== "audio")
      throw new Error(`Invalid audio entry path: ${entry.path}`);
    const [_, kind, episodeId, filename] = parts;
    if (kind !== entry.kind || episodeId !== entry.episodeId)
      throw new Error(
        `Audio entry metadata does not match its path: ${entry.path}`,
      );
    if (!entry.chapterId || !UUID.safeParse(episodeId).success)
      throw new Error(`Audio entry has an invalid ID: ${entry.path}`);
    const expected =
      entry.kind === "preview"
        ? `${entry.chapterId}-preview.wav`
        : `${entry.chapterId}.wav`;
    if (filename !== expected)
      throw new Error(
        `Audio entry filename does not match its chapter: ${entry.path}`,
      );
    return;
  }
  if (
    parts.length !== 4 ||
    parts[0] !== "audio" ||
    parts[1] !== "cache" ||
    parts[2] !== entry.chapterId ||
    !entry.chapterId ||
    !UUID.safeParse(entry.chapterId).success
  )
    throw new Error(`Invalid cache entry path: ${entry.path}`);
  const filename = parts[3];
  if (
    entry.kind === "cache-manifest" &&
    (filename !== "manifest.json" || entry.index !== undefined)
  )
    throw new Error(`Invalid cache manifest entry: ${entry.path}`);
  if (entry.kind === "segment") {
    if (entry.index === undefined || filename !== `${entry.index}.wav`)
      throw new Error(`Invalid cache segment entry: ${entry.path}`);
  }
}

function rejectSymlinkEntry(entry: Entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if ((unixMode & 0xf000) === 0xa000)
    throw new Error(`ZIP symlink entry is not allowed: ${entry.fileName}`);
  if (
    entry.fileName.endsWith("/") ||
    (entry.externalFileAttributes & 0x10) !== 0
  )
    throw new Error(`ZIP directory entry is not allowed: ${entry.fileName}`);
}

function openZip(filename: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      filename,
      { lazyEntries: true, autoClose: false, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          reject(error || new Error("Could not open notebook bundle."));
        else resolve(zip);
      },
    );
  });
}

function validateManifestOriginals(manifest: {
  version: number;
  notebook: Notebook;
  entries: BundleEntry[];
}) {
  const attachments = attachmentMap(manifest.notebook);
  const originals = new Map<string, BundleEntry>();
  for (const entry of manifest.entries) {
    if (entry.kind !== "original") continue;
    if (manifest.version < 2)
      throw new Error("Original source entries require bundle version 2.");
    validateBundleEntryShape(entry);
    const sha256 = entry.sha256 || entry.path.slice("originals/".length);
    if (originals.has(sha256))
      throw new Error(`Manifest contains duplicate original: ${sha256}`);
    originals.set(sha256, entry);
    const attachment = attachments.get(sha256);
    if (!attachment)
      throw new Error(
        `Original entry ${sha256} is not referenced by a source.`,
      );
    if (attachment.bytes !== entry.size)
      throw new Error(
        `Original entry size does not match source metadata: ${sha256}`,
      );
  }
  for (const [sha256, attachment] of attachments) {
    const entry = originals.get(sha256);
    if (!entry)
      throw new Error(`Source attachment ${sha256} is absent from the bundle.`);
    if (entry.size !== attachment.bytes)
      throw new Error(
        `Source attachment size does not match its bundle entry: ${sha256}`,
      );
  }
}

function readEntryText(
  zip: ZipFile,
  entry: Entry,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(
          error || new Error(`Could not read ZIP entry ${entry.fileName}.`),
        );
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          stream.destroy(
            new Error(`ZIP entry ${entry.fileName} exceeds its size limit.`),
          );
          return;
        }
        chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function collectArchiveEntries(
  archivePath: string,
  signal?: AbortSignal,
): Promise<{ manifest: BundleManifest; names: Set<string> }> {
  const zip = await openZip(archivePath);
  const names = new Set<string>();
  const lowerNames = new Set<string>();
  let totalBytes = 0;
  let notebookRaw: Buffer | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      zip.once("error", fail);
      zip.on("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on("entry", (entry: Entry) => {
        if (settled) return;
        try {
          throwIfAborted(signal);
          rejectSymlinkEntry(entry);
          if (!archivePathSafe(entry.fileName))
            throw new Error(`Unsafe ZIP path: ${entry.fileName}`);
          if (entry.generalPurposeBitFlag & 1)
            throw new Error(
              `Encrypted ZIP entry is not allowed: ${entry.fileName}`,
            );
          if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
            throw new Error(
              `Unsupported ZIP compression method for ${entry.fileName}.`,
            );
          if (
            names.has(entry.fileName) ||
            lowerNames.has(entry.fileName.toLowerCase())
          )
            throw new Error(`Duplicate ZIP entry: ${entry.fileName}`);
          if (
            !Number.isSafeInteger(entry.uncompressedSize) ||
            entry.uncompressedSize > MAX_ENTRY_BYTES
          )
            throw new Error(
              `ZIP entry exceeds the ${MAX_ENTRY_BYTES} byte limit: ${entry.fileName}`,
            );
          names.add(entry.fileName);
          lowerNames.add(entry.fileName.toLowerCase());
          totalBytes += entry.uncompressedSize;
          if (names.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES)
            throw new Error(
              "ZIP exceeds entry count or total uncompressed size limits.",
            );
          if (entry.fileName === NOTEBOOK_ENTRY) {
            if (entry.uncompressedSize > MAX_NOTEBOOK_BYTES)
              throw new Error("Notebook manifest exceeds the 20 MB limit.");
            void readEntryText(zip, entry, MAX_NOTEBOOK_BYTES).then(
              (value) => {
                notebookRaw = value;
                if (!settled) zip.readEntry();
              },
              (error) => fail(error as Error),
            );
          } else zip.readEntry();
        } catch (error) {
          fail(error as Error);
        }
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  if (!notebookRaw) throw new Error("ZIP does not contain notebook.json.");
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(notebookRaw.toString("utf8"));
  } catch {
    throw new Error("notebook.json is not valid JSON.");
  }
  const parsedV3 = v3ManifestSchema.safeParse(manifestRaw);
  const parsedLegacy = manifestSchema.safeParse(manifestRaw);
  const manifest: BundleManifest = parsedV3.success
    ? (parsedV3.data as V3BundleManifest)
    : parsedLegacy.success
      ? (parsedLegacy.data as NormalBundleManifest)
      : (() => {
          throw new Error("Notebook bundle manifest has an invalid schema.");
        })();
  for (const entry of manifest.entries) {
    if (entry.kind === "source-snapshot" && manifest.version !== 3)
      throw new Error("Source snapshot entries require bundle version 3.");
    validateBundleEntryShape(entry);
    if (
      entry.kind === "source-snapshot" &&
      entry.size > MAX_SOURCE_SNAPSHOT_BYTES
    )
      throw new Error(
        `Source snapshot ${entry.path} exceeds the ${MAX_SOURCE_SNAPSHOT_BYTES} byte limit.`,
      );
  }
  if (manifest.version !== 3) {
    validateNotebookReferences(manifest.notebook);
    validateManifestOriginals(manifest);
  }
  const expected = new Set([NOTEBOOK_ENTRY]);
  const expectedLower = new Set([NOTEBOOK_ENTRY]);
  const manifestEntries = new Set<string>();
  const audioReferences = new Set<string>();
  for (const item of manifest.entries) {
    if (!archivePathSafe(item.path) || item.path === NOTEBOOK_ENTRY)
      throw new Error(
        `Manifest contains an unsafe or reserved entry path: ${item.path}`,
      );
    if (
      manifestEntries.has(item.path) ||
      expectedLower.has(item.path.toLowerCase())
    )
      throw new Error(`Manifest contains a duplicate entry: ${item.path}`);
    manifestEntries.add(item.path);
    expected.add(item.path);
    expectedLower.add(item.path.toLowerCase());
    if (item.kind === "final" || item.kind === "preview") {
      const reference = `${item.chapterId}:${item.kind}`;
      if (audioReferences.has(reference))
        throw new Error(
          `Manifest contains duplicate ${item.kind} audio for chapter ${item.chapterId}.`,
        );
      audioReferences.add(reference);
    }
  }
  if (
    names.size !== expected.size ||
    [...names].some((name) => !expected.has(name))
  )
    throw new Error("ZIP contains entries outside its notebook manifest.");
  for (const item of manifest.entries) {
    validateBundleEntryShape(item);
    if (item.path.startsWith("audio/final/") && item.kind !== "final")
      throw new Error("Final audio entry kind mismatch.");
    if (item.path.startsWith("audio/preview/") && item.kind !== "preview")
      throw new Error("Preview audio entry kind mismatch.");
    if (
      item.path.startsWith("audio/cache/") &&
      !["segment", "cache-manifest"].includes(item.kind)
    )
      throw new Error("Cache entry kind mismatch.");
  }
  return { manifest, names };
}

async function extractArchive(
  archivePath: string,
  targets: Map<string, string>,
  staging: string,
  signal?: AbortSignal,
) {
  const zip = await openZip(archivePath);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };
      zip.once("error", fail);
      zip.on("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on("entry", (entry: Entry) => {
        if (settled) return;
        try {
          throwIfAborted(signal);
          rejectSymlinkEntry(entry);
          const target = targets.get(entry.fileName);
          if (entry.fileName === NOTEBOOK_ENTRY || !target) {
            zip.readEntry();
            return;
          }
          if (!archivePathSafe(entry.fileName))
            throw new Error(`Unsafe ZIP path: ${entry.fileName}`);
          void new Promise<void>((resolveStream, rejectStream) => {
            zip.openReadStream(entry, (error, stream) => {
              if (error || !stream) {
                rejectStream(
                  error || new Error(`Could not extract ${entry.fileName}.`),
                );
                return;
              }
              const destination = createWriteStream(target, { flags: "wx" });
              pipeline(stream, destination, { signal }).then(
                () => resolveStream(),
                rejectStream,
              );
            });
          }).then(
            () => {
              if (!settled) zip.readEntry();
            },
            (error) => fail(error as Error),
          );
        } catch (error) {
          fail(error as Error);
        }
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}

function entryTarget(
  entry: BundleEntry,
  chapterMap: Map<string, string>,
  episodeMap: Map<string, string>,
  audioDir: string,
): { targetName: string; targetPath: string } {
  if (entry.kind === "original" || entry.kind === "source-snapshot")
    throw new Error(`Entry has no audio destination: ${entry.path}`);
  if (!entry.chapterId || !chapterMap.has(entry.chapterId))
    throw new Error(`Audio entry ${entry.path} refers to an unknown chapter.`);
  const chapterId = chapterMap.get(entry.chapterId)!;
  if (entry.kind === "segment" || entry.kind === "cache-manifest") {
    const filename =
      entry.kind === "cache-manifest" ? "manifest.json" : `${entry.index}.wav`;
    return {
      targetName: filename,
      targetPath: safeCachePath(audioDir, chapterId, filename),
    };
  }
  if (!entry.episodeId || !episodeMap.has(entry.episodeId))
    throw new Error(`Audio entry ${entry.path} refers to an unknown episode.`);
  const filename =
    entry.kind === "preview" ? `${chapterId}-preview.wav` : `${chapterId}.wav`;
  return {
    targetName: filename,
    targetPath: safeAudioPath(audioDir, filename),
  };
}

function remapSource(source: Notebook["sources"][number]) {
  if (
    source.processing?.status !== "transcribing" &&
    source.processing?.status !== "recognizing"
  )
    return source;
  const ocr = source.processing.status === "recognizing";
  return {
    ...source,
    processing: {
      ...source.processing,
      task: ocr ? ("ocr" as const) : source.processing.task,
      status: "failed" as const,
      error: ocr
        ? "OCR was interrupted during import. Retry OCR when ready."
        : "Transcription was interrupted during import. Retry to continue.",
    },
  };
}

function remapNotebook(
  original: Notebook,
  episodeMap: Map<string, string>,
  chapterMap: Map<string, string>,
  audioEntries: BundleEntry[],
): Notebook {
  const audioByChapterAndKind = new Map(
    audioEntries
      .filter((entry) => entry.kind === "final" || entry.kind === "preview")
      .map((entry) => [`${entry.chapterId}:${entry.kind}`, entry]),
  );
  const now = new Date().toISOString();
  const episodes = original.episodes.map((episode) => ({
    ...episode,
    sources: episode.sources?.map(remapSource),
    id: episodeMap.get(episode.id)!,
    status:
      episode.status === "script" || episode.status === "audio"
        ? ("error" as const)
        : episode.status,
    error:
      episode.status === "script" || episode.status === "audio"
        ? "Generation was interrupted during import. Completed chapters are saved; retry to continue."
        : episode.error,
    chapters: episode.chapters.map((chapter) => {
      const mapped = { ...chapter, id: chapterMap.get(chapter.id)! };
      const final = audioByChapterAndKind.get(`${chapter.id}:final`);
      const preview = audioByChapterAndKind.get(`${chapter.id}:preview`);
      if (chapter.audioFile) mapped.audioFile = `${mapped.id}.wav`;
      else delete mapped.audioFile;
      if (preview) {
        // The episode-level previewFile is remapped below; chapter metadata only
        // carries the chapter ID through the bundle entry.
        void preview;
      }
      if (chapter.audioFile && !final)
        throw new Error(
          `Chapter ${chapter.id} references audio absent from the bundle.`,
        );
      return mapped;
    }),
  }));
  for (const [index, originalEpisode] of original.episodes.entries()) {
    const importedEpisode = episodes[index];
    if (originalEpisode.previewFile) {
      const chapter = originalEpisode.chapters.find(
        (candidate) =>
          `${candidate.id}-preview.wav` === originalEpisode.previewFile,
      );
      const preview =
        chapter && audioByChapterAndKind.get(`${chapter.id}:preview`);
      if (!preview)
        throw new Error(
          `Episode ${originalEpisode.id} preview is absent from the bundle.`,
        );
      importedEpisode.previewFile = `${chapterMap.get(chapter.id)!}-preview.wav`;
    } else delete importedEpisode.previewFile;
  }
  return {
    ...original,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    sources: original.sources.map(remapSource),
    episodes,
  };
}

async function cleanupPaths(paths: string[], staging?: string) {
  for (const filename of [...paths].reverse())
    await rm(filename, { force: true }).catch(() => {});
  if (staging)
    await rm(staging, { recursive: true, force: true }).catch(() => {});
}

/**
 * Validate, extract, remap, and stage a notebook bundle. The caller should
 * persist result.notebook only after this resolves; call result.cleanup() if
 * persistence fails. No existing audio file is overwritten.
 */
export async function importNotebookBundle(
  archivePath: string,
  audioDir: string,
  options: BundleOptions = {},
): Promise<NotebookBundleImport> {
  throwIfAborted(options.signal);
  const archiveInfo = await stat(archivePath);
  if (!archiveInfo.isFile() || isSymlink(archivePath))
    throw new Error("Notebook bundle must be a regular file.");
  const { manifest } = await collectArchiveEntries(archivePath, options.signal);
  throwIfAborted(options.signal);
  await mkdir(audioDir, { recursive: true });
  const originalsDir =
    options.originalsDir || path.join(path.dirname(audioDir), "originals");
  const staging = await mkdtemp(path.join(audioDir, ".bundle-import-"));
  const createdFiles: string[] = [];
  try {
    const episodeMap = new Map(
      manifest.notebook.episodes.map((episode) => [episode.id, randomUUID()]),
    );
    const chapterMap = new Map(
      manifest.notebook.episodes.flatMap((episode) =>
        episode.chapters.map((chapter) => [chapter.id, randomUUID()] as const),
      ),
    );
    const targets = new Map<string, string>();
    const destinationByEntry = new Map<string, string>();
    for (const entry of manifest.entries) {
      const staged = path.join(staging, String(targets.size));
      await mkdir(path.dirname(staged), { recursive: true });
      targets.set(entry.path, staged);
      if (entry.kind === "original" || entry.kind === "source-snapshot")
        continue;
      const destination = entryTarget(
        entry,
        chapterMap,
        episodeMap,
        audioDir,
      ).targetPath;
      destinationByEntry.set(entry.path, destination);
    }
    await extractArchive(archivePath, targets, staging, options.signal);
    let notebook: Notebook;
    if (manifest.version === 3) {
      const sourceEntries = manifest.entries.filter(
        (entry) => entry.kind === "source-snapshot",
      );
      if (sourceEntries.length > MAX_SOURCE_SET_COUNT)
        throw new Error(
          `Bundle contains ${sourceEntries.length} source sets; maximum is ${MAX_SOURCE_SET_COUNT}.`,
        );
      let declaredSourceBytes = 0;
      for (const entry of sourceEntries) {
        declaredSourceBytes += entry.size;
        if (declaredSourceBytes > MAX_EXPANDED_SOURCE_BYTES)
          throw new Error(
            `Declared source snapshots exceed the ${MAX_EXPANDED_SOURCE_BYTES} byte limit.`,
          );
      }
      const snapshotInputs = [];
      for (const entry of sourceEntries) {
        const staged = targets.get(entry.path)!;
        const info = await stat(staged);
        if (info.size !== entry.size)
          throw new Error(`Extracted size mismatch for ${entry.path}.`);
        if (info.size > MAX_SOURCE_SNAPSHOT_BYTES)
          throw new Error(
            `Source snapshot ${entry.path} exceeds its size limit.`,
          );
        snapshotInputs.push({
          path: entry.path,
          kind: entry.kind,
          size: entry.size,
          sha256: entry.sha256,
          content: await readFile(staged),
        });
      }
      const expanded = decodeSourceSnapshots(
        manifest.notebook,
        snapshotInputs,
        (raw) => z.array(sourceSchema).max(150).parse(raw),
      );
      const parsed = notebookSchema.safeParse(expanded);
      if (!parsed.success)
        throw new Error(
          "Notebook bundle manifest has an invalid notebook schema.",
        );
      notebook = parsed.data;
      validateNotebookReferences(notebook);
      validateManifestOriginals({
        version: manifest.version,
        notebook,
        entries: manifest.entries,
      });
    } else {
      notebook = manifest.notebook;
    }
    const attachments = attachmentMap(notebook);
    // Validate every staged payload before publishing any source original.
    // In particular, a malformed later audio entry must not leave an earlier
    // original behind in the shared content-addressed store.
    for (const entry of manifest.entries) {
      throwIfAborted(options.signal);
      const staged = targets.get(entry.path)!;
      const info = await stat(staged);
      if (info.size !== entry.size)
        throw new Error(`Extracted size mismatch for ${entry.path}.`);
      if (entry.kind === "source-snapshot") continue;
      if (entry.kind === "original") {
        const sha256 = entry.sha256 || entry.path.slice("originals/".length);
        const attachment = attachments.get(sha256);
        if (!attachment)
          throw new Error(`Original entry ${sha256} has no source metadata.`);
        if (attachment.bytes !== info.size || entry.size !== info.size)
          throw new Error(`Original source hash mismatch for ${entry.path}.`);
        if ((await hashOriginal(staged, options.signal)) !== sha256)
          throw new Error(`Original source hash mismatch for ${entry.path}.`);
        continue;
      }
      const destination = destinationByEntry.get(entry.path)!;
      if (
        entry.kind === "final" ||
        entry.kind === "preview" ||
        entry.kind === "segment"
      )
        await validateWavFile(staged);
      if (entry.kind === "cache-manifest") {
        if (info.size > MAX_CACHE_MANIFEST_BYTES)
          throw new Error("Audio cache manifest is too large.");
        const parsed = JSON.parse(await readFile(staged, "utf8"));
        if (
          parsed?.version !== 1 ||
          typeof parsed.fingerprint !== "string" ||
          typeof parsed.segmentCount !== "number" ||
          typeof parsed.legacy !== "boolean"
        )
          throw new Error(`Invalid audio cache manifest: ${entry.path}`);
      }
      if (existsSync(destination))
        throw new Error(
          `Import would overwrite existing audio: ${destination}`,
        );
    }
    const importedNotebook = remapNotebook(
      notebook,
      episodeMap,
      chapterMap,
      manifest.entries,
    );
    // Publishing is deliberately separate from validation. Originals are
    // shared by content hash, so a commit-stage failure leaves no safe way to
    // decide whether an existing path became owned by a concurrent import;
    // never delete a hash path blindly during rollback.
    for (const entry of manifest.entries) {
      if (entry.kind !== "original") continue;
      throwIfAborted(options.signal);
      const staged = targets.get(entry.path)!;
      const sha256 = entry.sha256 || entry.path.slice("originals/".length);
      const attachment = attachments.get(sha256)!;
      const stored = await storeOriginal(
        originalsDir,
        staged,
        attachment.filename,
        attachment.mediaType,
        options.signal,
      );
      if (stored.sha256 !== sha256 || stored.bytes !== entry.size)
        throw new Error(`Original source hash mismatch for ${entry.path}.`);
    }
    for (const entry of manifest.entries) {
      if (entry.kind === "original" || entry.kind === "source-snapshot")
        continue;
      const staged = targets.get(entry.path)!;
      const destination = destinationByEntry.get(entry.path)!;
      await mkdir(path.dirname(destination), { recursive: true });
      if (existsSync(destination))
        throw new Error(
          `Import would overwrite existing audio: ${destination}`,
        );
      await rename(staged, destination);
      createdFiles.push(destination);
    }
    await rm(staging, { recursive: true, force: true });
    const cleanup = async () => cleanupPaths(createdFiles);
    return { notebook: importedNotebook, createdFiles, cleanup };
  } catch (error) {
    await cleanupPaths(createdFiles, staging);
    throw error;
  }
}
