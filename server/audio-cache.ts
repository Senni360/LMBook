import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { Chapter, Settings } from "../shared/model.ts";
import { readWav } from "./core.ts";

export type AudioCacheManifest = {
  version: 1;
  fingerprint: string;
  segmentCount: number;
  legacy: boolean;
};

function temporaryPath(target: string) {
  return `${target}.tmp-${process.pid}-${randomUUID()}`;
}

function writeAtomic(target: string, value: Buffer | string) {
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = temporaryPath(target);
  writeFileSync(temporary, value, { flag: "wx" });
  try {
    try {
      renameSync(temporary, target);
    } catch (error: any) {
      // Windows cannot replace an existing file with renameSync. Remove the
      // old value only after the complete temporary value has been written.
      if (error?.code !== "EEXIST" && error?.code !== "EPERM") throw error;
      rmSync(target, { force: true });
      renameSync(temporary, target);
    }
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function chapterFingerprint(chapter: Chapter, settings: Settings) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        turns: chapter.turns.map((turn) => ({
          speaker: turn.speaker,
          text: turn.text,
        })),
        language: settings.language,
        ...(settings.ttsProvider === "cartesia" ? {
          provider: "cartesia", model: settings.cartesiaModel,
          voiceA: settings.cartesiaVoiceA, voiceB: settings.cartesiaVoiceB,
          speed: settings.cartesiaSpeed, segmentation: "per-turn-v1",
        } : {
          voiceA: settings.voiceA,
          voiceB: settings.voiceB,
          ttsModel: settings.ttsModel,
        }),
      }),
    )
    .digest("hex");
}

export function segmentPath(cacheDir: string, index: number) {
  return path.join(cacheDir, `${index}.wav`);
}

export function manifestPath(cacheDir: string) {
  return path.join(cacheDir, "manifest.json");
}

export function finalAudioPath(audioDirectory: string, filename: string) {
  return path.join(audioDirectory, filename);
}

export function readManifest(cacheDir: string): AudioCacheManifest | undefined {
  const filename = manifestPath(cacheDir);
  if (!existsSync(filename)) return undefined;
  try {
    const value = JSON.parse(
      readFileSync(filename, "utf8"),
    ) as Partial<AudioCacheManifest>;
    if (
      value.version !== 1 ||
      typeof value.fingerprint !== "string" ||
      typeof value.segmentCount !== "number" ||
      typeof value.legacy !== "boolean"
    )
      return undefined;
    return value as AudioCacheManifest;
  } catch {
    return undefined;
  }
}

function writeManifest(cacheDir: string, manifest: AudioCacheManifest) {
  writeAtomic(manifestPath(cacheDir), JSON.stringify(manifest));
}

function quarantine(cacheDir: string) {
  if (!existsSync(cacheDir)) return;
  const destination = `${cacheDir}.stale-${Date.now()}-${randomUUID().slice(0, 8)}`;
  renameSync(cacheDir, destination);
}

/**
 * Prepare a chapter cache for the current script and voice settings.
 *
 * Legacy caches have no fingerprint. They are reusable only when the episode
 * already says that this chapter was audio-locked (or has a completed final
 * file). They remain explicitly marked legacy in the manifest. Unknown caches
 * from an interrupted write are quarantined instead of being trusted.
 */
export function ensureAudioCache(
  cacheDir: string,
  fingerprint: string,
  segmentCount: number,
  allowLegacy: boolean,
) {
  mkdirSync(cacheDir, { recursive: true });
  let manifest = readManifest(cacheDir);
  if (manifest && manifest.fingerprint !== fingerprint) {
    quarantine(cacheDir);
    mkdirSync(cacheDir, { recursive: true });
    manifest = undefined;
  }
  if (!manifest) {
    const legacySegments = readdirSync(cacheDir).some((name) =>
      /^\d+\.wav$/u.test(name),
    );
    if (legacySegments && !allowLegacy) {
      quarantine(cacheDir);
      mkdirSync(cacheDir, { recursive: true });
    }
    manifest = {
      version: 1,
      fingerprint,
      segmentCount,
      legacy: legacySegments,
    };
  } else if (manifest.segmentCount < segmentCount) {
    manifest = { ...manifest, segmentCount };
  }
  writeManifest(cacheDir, manifest);
  return manifest;
}

export function readCachedSegment(cacheDir: string, index: number) {
  const filename = segmentPath(cacheDir, index);
  if (!existsSync(filename)) return undefined;
  try {
    const buffer = readFileSync(filename);
    readWav(buffer);
    return buffer;
  } catch {
    // A partial write must never poison every future retry.
    rmSync(filename, { force: true });
    return undefined;
  }
}

export function writeCachedSegment(
  cacheDir: string,
  index: number,
  buffer: Buffer,
) {
  readWav(buffer);
  writeAtomic(segmentPath(cacheDir, index), buffer);
}

export function readCachedFinal(filename: string) {
  if (!existsSync(filename)) return undefined;
  try {
    const buffer = readFileSync(filename);
    const wav = readWav(buffer);
    return { buffer, seconds: wav.pcm.length / wav.format.readUInt32LE(8) };
  } catch {
    return undefined;
  }
}

export function writeCachedFinal(filename: string, buffer: Buffer) {
  readWav(buffer);
  writeAtomic(filename, buffer);
}
