import { open, type FileHandle } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RIFF_HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;
const MAX_FMT_CHUNK = 4096;
const READ_SIZE = 64 * 1024;
const RIFF_MAX_SIZE = 0xffffffff;
const MAX_METADATA_LENGTH = 256;

export type WavFile = {
  path: string;
  format: Buffer;
  dataOffset: number;
  dataLength: number;
  fileSize: number;
};

export type WavExport = {
  /** Ordered chapter files, after format and structural validation. */
  files: readonly WavFile[];
  /** Canonical RIFF/WAVE header for the concatenated data chunks. */
  header: Buffer;
  /** Bytes emitted by createWavStream, including header. */
  contentLength: number;
  /** Playback duration in seconds at the common WAV byte rate. */
  seconds: number;
};

export type ExportStreamOptions = {
  signal?: AbortSignal;
};

export type Mp3StreamOptions = ExportStreamOptions & {
  /** Executable name or absolute path. Defaults to ffmpeg on PATH. */
  ffmpegPath?: string;
  /** libmp3lame target bitrate. Defaults to 128k. */
  bitrate?: string;
  /** Optional bounded ID3 metadata written into the MP3 stream. */
  title?: string;
  artist?: string;
  album?: string;
};

function abortError(signal?: AbortSignal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Audio export cancelled.");
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal);
}

function metadataValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  return clean ? clean.slice(0, MAX_METADATA_LENGTH) : undefined;
}

async function readExactly(
  handle: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(
      buffer,
      offset,
      length - offset,
      position + offset,
    );
    if (!result.bytesRead) throw new Error("WAV file is incomplete.");
    offset += result.bytesRead;
  }
  return buffer;
}

/**
 * Inspect one chapter WAV without reading its PCM payload into memory.
 * Only the RIFF chunks and the small fmt chunk are read.
 */
export async function validateWavFile(filePath: string): Promise<WavFile> {
  const handle = await open(filePath, "r");
  try {
    const fileSize = Number((await handle.stat()).size);
    if (fileSize < RIFF_HEADER_SIZE + CHUNK_HEADER_SIZE)
      throw new Error("WAV file is too small.");
    const riff = await readExactly(handle, 0, RIFF_HEADER_SIZE);
    if (
      riff.toString("ascii", 0, 4) !== "RIFF" ||
      riff.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new Error("Expected a RIFF/WAVE file.");
    const riffSize = riff.readUInt32LE(4);
    if (riffSize < 4 || riffSize + 8 > fileSize)
      throw new Error("WAV RIFF chunk is incomplete.");

    let format: Buffer | undefined;
    let dataOffset = -1;
    let dataLength = 0;
    let offset = RIFF_HEADER_SIZE;
    const riffEnd = Math.min(fileSize, riffSize + 8);
    while (offset + CHUNK_HEADER_SIZE <= riffEnd) {
      const chunk = await readExactly(handle, offset, CHUNK_HEADER_SIZE);
      const tag = chunk.toString("ascii", 0, 4);
      const size = chunk.readUInt32LE(4);
      const bytesStart = offset + CHUNK_HEADER_SIZE;
      const bytesEnd = bytesStart + size;
      const paddedEnd = bytesEnd + (size % 2);
      if (bytesEnd > riffEnd || paddedEnd > fileSize)
        throw new Error("WAV file is incomplete.");
      if (tag === "fmt ") {
        if (size < 16 || size > MAX_FMT_CHUNK)
          throw new Error("WAV fmt chunk is invalid.");
        format = await readExactly(handle, bytesStart, size);
      } else if (tag === "data") {
        if (dataOffset >= 0)
          throw new Error("WAV contains multiple data chunks.");
        dataOffset = bytesStart;
        dataLength = size;
      }
      offset = paddedEnd;
    }
    if (offset !== riffEnd || !format || dataOffset < 0 || dataLength === 0)
      throw new Error("WAV must contain complete fmt and data chunks.");
    if (format.readUInt16LE(0) !== 1)
      throw new Error("Only uncompressed PCM WAV audio is supported.");
    const channels = format.readUInt16LE(2);
    const sampleRate = format.readUInt32LE(4);
    const byteRate = format.readUInt32LE(8);
    const blockAlign = format.readUInt16LE(12);
    const bitsPerSample = format.readUInt16LE(14);
    if (!channels || !sampleRate || !byteRate || !blockAlign || !bitsPerSample)
      throw new Error("WAV fmt chunk is invalid.");
    if (dataLength % blockAlign !== 0)
      throw new Error("WAV data is not aligned to complete PCM frames.");
    return { path: filePath, format, dataOffset, dataLength, fileSize };
  } finally {
    await handle.close();
  }
}

function makeHeader(format: Buffer, dataLength: number): Buffer {
  const header = Buffer.alloc(28 + format.length);
  header.write("RIFF", 0);
  header.writeUInt32LE(header.length + dataLength - 8, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(format.length, 16);
  format.copy(header, 20);
  header.write("data", 20 + format.length);
  header.writeUInt32LE(dataLength, 24 + format.length);
  return header;
}

/** Validate ordered chapter paths and calculate the exact WAV response length. */
export async function validateWavFiles(
  filePaths: readonly string[],
): Promise<WavExport> {
  if (!filePaths.length) throw new Error("No audio chapters were supplied.");
  const files = await Promise.all(
    filePaths.map((filePath) => validateWavFile(filePath)),
  );
  const first = files[0];
  if (files.some((file) => !file.format.equals(first.format)))
    throw new Error("Audio chapters have incompatible WAV formats.");
  const dataLength = files.reduce((total, file) => total + file.dataLength, 0);
  if (28 + first.format.length + dataLength - 8 > RIFF_MAX_SIZE)
    throw new Error("The episode is too large for a RIFF/WAVE file.");
  const header = makeHeader(first.format, dataLength);
  return {
    files,
    header,
    contentLength: header.length + dataLength,
    seconds: dataLength / first.format.readUInt32LE(8),
  };
}

async function* wavChunks(
  audio: WavExport,
  signal?: AbortSignal,
): AsyncGenerator<Buffer> {
  throwIfAborted(signal);
  yield audio.header;
  for (const file of audio.files) {
    throwIfAborted(signal);
    const handle = await open(file.path, "r");
    try {
      let offset = file.dataOffset;
      let remaining = file.dataLength;
      while (remaining) {
        throwIfAborted(signal);
        const size = Math.min(remaining, READ_SIZE);
        const chunk = await readExactly(handle, offset, size);
        offset += size;
        remaining -= size;
        yield chunk;
      }
    } finally {
      await handle.close();
    }
  }
}

/** Create a backpressure-aware stream of one valid concatenated WAV. */
export function createWavStream(
  audio: WavExport,
  options: ExportStreamOptions = {},
): Readable {
  return Readable.from(wavChunks(audio, options.signal));
}

function childError(
  stderr: Buffer,
  code: number | null,
  signal: NodeJS.Signals | null,
) {
  const detail = stderr.toString("utf8").trim();
  return new Error(
    `ffmpeg failed${code === null ? ` (${signal || "terminated"})` : ` with exit code ${code}`}${detail ? `: ${detail}` : "."}`,
  );
}

/** Return whether the configured ffmpeg executable can be started. */
export function hasFfmpeg(ffmpegPath = "ffmpeg"): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (available: boolean) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(available);
      }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffmpegPath, ["-version"], {
        stdio: "ignore",
        shell: false,
        windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
    timeout = setTimeout(() => {
      child.kill();
      finish(false);
    }, 4000);
  });
}

/**
 * Stream a validated WAV through ffmpeg as MP3. ffmpeg receives the WAV over
 * stdin, so no temporary episode-sized file is created. Destroying the
 * returned stream or aborting its signal terminates ffmpeg and closes input.
 */
export async function createMp3Stream(
  audio: WavExport,
  options: Mp3StreamOptions = {},
): Promise<Readable> {
  const ffmpegPath = options.ffmpegPath || "ffmpeg";
  if (!(await hasFfmpeg(ffmpegPath)))
    throw new Error(
      "ffmpeg is not available. Install ffmpeg or choose WAV export.",
    );
  throwIfAborted(options.signal);
  const bitrate = options.bitrate || "128k";
  const metadataArgs: string[] = [];
  for (const [key, value] of [
    ["title", metadataValue(options.title)],
    ["artist", metadataValue(options.artist)],
    ["album", metadataValue(options.album)],
  ] as const) {
    if (value) metadataArgs.push("-metadata", `${key}=${value}`);
  }
  const child = spawn(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "wav",
      "-i",
      "pipe:0",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      bitrate,
      ...metadataArgs,
      "-f",
      "mp3",
      "pipe:1",
    ],
    { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true },
  ) as ChildProcessWithoutNullStreams;
  const output = new PassThrough();
  const stderr: Buffer[] = [];
  let closed = false;
  child.stderr.on("data", (chunk: Buffer) => {
    if (Buffer.byteLength(Buffer.concat(stderr)) < 32 * 1024)
      stderr.push(Buffer.from(chunk));
  });
  child.stdout.pipe(output, { end: false });
  child.stdout.once("error", (error) => output.destroy(error));
  child.once("error", (error) => output.destroy(error));
  child.once("close", (code, signal) => {
    closed = true;
    if (code === 0) output.end();
    else output.destroy(childError(Buffer.concat(stderr), code, signal));
  });

  const wav = createWavStream(audio, options);
  const stop = () => {
    wav.destroy();
    if (!closed) child.kill();
  };
  output.once("close", stop);
  if (options.signal) {
    const abort = () => {
      output.destroy(abortError(options.signal));
      stop();
    };
    options.signal.addEventListener("abort", abort, { once: true });
    output.once("close", () =>
      options.signal?.removeEventListener("abort", abort),
    );
  }
  void pipeline(wav, child.stdin).catch((error) => {
    if (!closed) {
      child.kill();
      output.destroy(error);
    }
  });
  return output;
}
