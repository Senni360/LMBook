import { lstat, readdir, rmdir, rm } from "node:fs/promises";
import path from "node:path";
import { sourceAttachmentSchema, type Notebook } from "../shared/model.ts";
import {
  audioDir,
  completeTrashPurge,
  getTrashedNotebook,
  listNotebooks,
  listTrashedNotebooks,
  markTrashPurging,
  originalsDir,
  setTrashError,
  setTrashPurgeError,
  type NotebookTrashRecord,
} from "./store.ts";
import { originalPath } from "./source-originals.ts";

type ArtifactRefs = {
  originals: Set<string>;
  audio: Set<string>;
  caches: Set<string>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function emptyRefs(): ArtifactRefs {
  return { originals: new Set(), audio: new Set(), caches: new Set() };
}

function safeAudioFilename(filename: string, expected: string) {
  const root = path.resolve(audioDir);
  const resolved = path.resolve(root, filename);
  if (
    filename !== expected ||
    filename.includes("\\") ||
    filename.includes("\0") ||
    path.basename(filename) !== filename ||
    !resolved.startsWith(`${root}${path.sep}`)
  )
    throw new Error(
      `Notebook references an unsafe audio filename: ${filename}`,
    );
  return resolved;
}

function addNotebookRefs(notebook: Notebook, refs: ArtifactRefs) {
  const addSource = (source: Notebook["sources"][number]) => {
    if (!source.attachment) return;
    const attachment = sourceAttachmentSchema.parse(source.attachment);
    refs.originals.add(attachment.sha256);
  };
  notebook.sources.forEach(addSource);
  for (const deck of notebook.flashcards || []) deck.sources.forEach(addSource);
  for (const episode of notebook.episodes) {
    (episode.sources || notebook.sources).forEach(addSource);
    for (const chapter of episode.chapters) {
      refs.caches.add(chapter.id);
      if (!UUID_PATTERN.test(chapter.id))
        throw new Error(
          `Notebook references an unsafe chapter ID: ${chapter.id}`,
        );
      // A crash can leave a final or preview file after writing it but before
      // saving the corresponding notebook field. The chapter UUID is the
      // bounded ownership key for both recognized audio names.
      refs.audio.add(
        safeAudioFilename(`${chapter.id}.wav`, `${chapter.id}.wav`),
      );
      refs.audio.add(
        safeAudioFilename(
          `${chapter.id}-preview.wav`,
          `${chapter.id}-preview.wav`,
        ),
      );
      if (chapter.audioFile)
        refs.audio.add(
          safeAudioFilename(chapter.audioFile, `${chapter.id}.wav`),
        );
    }
    if (episode.previewFile) {
      const chapter = episode.chapters.find(
        (candidate) => episode.previewFile === `${candidate.id}-preview.wav`,
      );
      if (!chapter)
        throw new Error(
          `Episode ${episode.id} references an unsafe or unknown preview file.`,
        );
      refs.audio.add(
        safeAudioFilename(episode.previewFile, `${chapter.id}-preview.wav`),
      );
    }
  }
}

function collectRefs(notebooks: Notebook[]): ArtifactRefs {
  const refs = emptyRefs();
  notebooks.forEach((notebook) => addNotebookRefs(notebook, refs));
  return refs;
}

async function existingRegularFile(filename: string) {
  try {
    const info = await lstat(filename);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error(`Refusing to purge unsafe artifact: ${filename}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function removeRegularFile(filename: string) {
  if (await existingRegularFile(filename)) await rm(filename, { force: true });
}

const CACHE_ENTRY_PATTERN = /^(?:manifest\.json|\d+\.wav)$/u;
const CACHE_TEMP_PATTERN =
  /^(?:manifest\.json|\d+\.wav)\.tmp-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AUDIO_TEMP_SUFFIX_PATTERN =
  /^\.tmp-\d+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type ValidatedCache = {
  directory: string;
  entries: import("node:fs").Dirent[];
};

function validateCacheEntries(
  entries: import("node:fs").Dirent[],
  description: string,
) {
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(
        `Refusing to purge symlinked audio cache entry: ${description}/${entry.name}`,
      );
    if (
      !entry.isFile() ||
      (!CACHE_ENTRY_PATTERN.test(entry.name) &&
        !CACHE_TEMP_PATTERN.test(entry.name))
    )
      throw new Error(
        `Refusing to purge unknown audio cache entry: ${description}/${entry.name}`,
      );
  }
}

function cacheQuarantinePattern(chapterId: string) {
  return new RegExp(`^${chapterId}\\.stale-[0-9]+-[0-9a-f]{8}$`, "iu");
}

async function validateCacheDirectoryPath(
  directory: string,
  description: string,
): Promise<ValidatedCache | undefined> {
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory())
    throw new Error(`Refusing to purge unsafe audio cache: ${description}`);
  const entries = await readdir(directory, { withFileTypes: true });
  validateCacheEntries(entries, description);
  return { directory, entries };
}

async function validateCacheDirectory(chapterId: string) {
  if (!UUID_PATTERN.test(chapterId))
    throw new Error(
      `Notebook references an unsafe chapter cache: ${chapterId}`,
    );
  const directory = path.resolve(audioDir, chapterId);
  const root = path.resolve(audioDir);
  if (!directory.startsWith(`${root}${path.sep}`))
    throw new Error(
      `Notebook references an unsafe chapter cache: ${chapterId}`,
    );
  return validateCacheDirectoryPath(directory, chapterId);
}

async function validateCacheQuarantineSiblings(
  chapterId: string,
  rootEntries: import("node:fs").Dirent[],
) {
  const root = path.resolve(audioDir);
  const pattern = cacheQuarantinePattern(chapterId);
  const siblings: ValidatedCache[] = [];
  for (const entry of rootEntries) {
    if (!pattern.test(entry.name)) continue;
    const validated = await validateCacheDirectoryPath(
      path.join(root, entry.name),
      entry.name,
    );
    if (validated) siblings.push(validated);
  }
  return siblings;
}

async function validateAudioTempFiles(
  filename: string,
  rootEntries: import("node:fs").Dirent[],
) {
  const root = path.resolve(audioDir);
  const base = path.basename(filename);
  const temporary: string[] = [];
  for (const entry of rootEntries) {
    if (!entry.name.startsWith(`${base}.tmp-`)) continue;
    if (!AUDIO_TEMP_SUFFIX_PATTERN.test(entry.name.slice(base.length)))
      throw new Error(
        `Refusing to purge unknown audio temp file: ${entry.name}`,
      );
    if (entry.isSymbolicLink() || !entry.isFile())
      throw new Error(
        `Refusing to purge unsafe audio temp file: ${entry.name}`,
      );
    temporary.push(path.join(root, entry.name));
  }
  return temporary;
}

async function removeCacheEntries(validated: ValidatedCache | undefined) {
  if (!validated) return;
  const { directory, entries } = validated;
  for (const entry of entries)
    await rm(path.join(directory, entry.name), { force: true });
  await rmdir(directory);
}

function trashSummary(record: NotebookTrashRecord) {
  return {
    id: record.id,
    title: record.title,
    deletedAt: record.deletedAt,
    state: record.state,
    ...(record.error ? { error: record.error } : {}),
    sourceCount: record.notebook.sources.length,
    episodeCount: record.notebook.episodes.length,
  };
}

export function listTrash() {
  return listTrashedNotebooks().map(trashSummary);
}

export async function purgeTrashNotebook(id: string) {
  let target: NotebookTrashRecord | undefined;
  let purgeStarted = false;
  try {
    target = getTrashedNotebook(id);
    purgeStarted = target.state === "purging";
    const others = [
      ...listNotebooks(),
      ...listTrashedNotebooks()
        .filter((record) => record.id !== id)
        .map((record) => record.notebook),
    ];
    const retainedEpisodeIds = new Set(
      others.flatMap((notebook) =>
        notebook.episodes.map((episode) => episode.id),
      ),
    );
    const episodeIds = target.notebook.episodes
      .map((episode) => episode.id)
      .filter((episodeId) => !retainedEpisodeIds.has(episodeId));
    const targetRefs = collectRefs([target.notebook]);
    const liveRefs = collectRefs(others);
    const validatedCaches = new Map<
      string,
      Awaited<ReturnType<typeof validateCacheDirectory>>
    >();
    const validatedCacheSiblings = new Map<string, ValidatedCache[]>();
    const validatedAudioTemps = new Map<string, string[]>();
    const audioRootEntries = await readdir(path.resolve(audioDir), {
      withFileTypes: true,
    });
    // Validate every target artifact before removing the first one. A malformed
    // later cache must not produce a partially purged trash entry.
    for (const sha256 of targetRefs.originals)
      await existingRegularFile(originalPath(originalsDir, sha256));
    for (const filename of targetRefs.audio) {
      await existingRegularFile(filename);
      validatedAudioTemps.set(
        filename,
        await validateAudioTempFiles(filename, audioRootEntries),
      );
    }
    for (const chapterId of targetRefs.caches) {
      validatedCaches.set(chapterId, await validateCacheDirectory(chapterId));
      validatedCacheSiblings.set(
        chapterId,
        await validateCacheQuarantineSiblings(chapterId, audioRootEntries),
      );
    }
    // Keep a validated trashed notebook recoverable until every preflight check
    // has passed. Once this transition commits, physical deletion may begin.
    if (!purgeStarted) {
      markTrashPurging(id);
      purgeStarted = true;
    }
    for (const sha256 of targetRefs.originals)
      if (!liveRefs.originals.has(sha256))
        await removeRegularFile(originalPath(originalsDir, sha256));
    for (const filename of targetRefs.audio)
      if (!liveRefs.audio.has(filename)) {
        await removeRegularFile(filename);
        for (const temporary of validatedAudioTemps.get(filename) || [])
          await removeRegularFile(temporary);
      }
    for (const chapterId of targetRefs.caches)
      if (!liveRefs.caches.has(chapterId)) {
        await removeCacheEntries(validatedCaches.get(chapterId));
        for (const sibling of validatedCacheSiblings.get(chapterId) || [])
          await removeCacheEntries(sibling);
      }
    completeTrashPurge(id);
    return { episodeIds };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Permanent deletion failed.";
    if (purgeStarted) setTrashPurgeError(id, message);
    else setTrashError(id, message);
    throw error;
  }
}
