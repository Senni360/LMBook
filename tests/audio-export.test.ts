import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createMp3Stream,
  createWavStream,
  hasFfmpeg,
  validateWavFiles,
} from "../server/audio-export.ts";

function wav(samples: number[], sampleRate = 8000): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * 2));
  const result = Buffer.alloc(44 + pcm.length);
  result.write("RIFF", 0);
  result.writeUInt32LE(result.length - 8, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(sampleRate, 24);
  result.writeUInt32LE(sampleRate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(pcm.length, 40);
  pcm.copy(result, 44);
  return result;
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("validates ordered WAV chapters and streams one canonical WAV without loading PCM", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sennibook-audio-export-"));
  try {
    const first = path.join(directory, "chapter-1.wav");
    const second = path.join(directory, "chapter-2.wav");
    writeFileSync(first, wav([100, 200, 300]));
    writeFileSync(second, wav([-100, -200]));
    const plan = await validateWavFiles([first, second]);
    assert.equal(plan.files.length, 2);
    assert.equal(plan.seconds, 5 / 8000);
    assert.equal(plan.contentLength, 44 + 5 * 2);

    const output = await collect(createWavStream(plan));
    assert.equal(output.length, plan.contentLength);
    assert.equal(output.toString("ascii", 0, 4), "RIFF");
    assert.equal(output.readUInt32LE(4), output.length - 8);
    assert.equal(output.readUInt32LE(40), 10);
    assert.deepEqual(
      output.subarray(44),
      Buffer.concat([
        wav([100, 200, 300]).subarray(44),
        wav([-100, -200]).subarray(44),
      ]),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects empty, truncated, and incompatible chapter files", async () => {
  const directory = mkdtempSync(
    path.join(tmpdir(), "sennibook-audio-invalid-"),
  );
  try {
    const first = path.join(directory, "first.wav");
    const second = path.join(directory, "second.wav");
    const truncated = path.join(directory, "truncated.wav");
    writeFileSync(first, wav([1, 2]));
    writeFileSync(second, wav([3, 4], 16000));
    writeFileSync(truncated, wav([1, 2]).subarray(0, 42));
    await assert.rejects(() => validateWavFiles([]), /No audio chapters/);
    await assert.rejects(
      () => validateWavFiles([first, second]),
      /incompatible WAV formats/,
    );
    await assert.rejects(
      () => validateWavFiles([truncated]),
      /incomplete|small/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("aborting a WAV stream stops before reading chapter data", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "sennibook-audio-abort-"));
  try {
    const file = path.join(directory, "chapter.wav");
    writeFileSync(file, wav([1, 2, 3]));
    const plan = await validateWavFiles([file]);
    const controller = new AbortController();
    controller.abort(new Error("caller cancelled"));
    await assert.rejects(
      () => collect(createWavStream(plan, { signal: controller.signal })),
      /caller cancelled/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reports unavailable ffmpeg without invoking a shell", async () => {
  assert.equal(await hasFfmpeg("definitely-not-a-real-ffmpeg"), false);
});

test("optionally converts the streaming WAV to MP3 through ffmpeg", async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip("ffmpeg is not installed on PATH");
    return;
  }
  const directory = mkdtempSync(path.join(tmpdir(), "sennibook-audio-mp3-"));
  try {
    const file = path.join(directory, "chapter.wav");
    writeFileSync(
      file,
      wav(Array.from({ length: 800 }, (_, i) => (i % 20) * 100)),
    );
    const plan = await validateWavFiles([file]);
    const mp3 = await createMp3Stream(plan);
    const output = await collect(mp3);
    assert.ok(output.length > 0);
    assert.ok(
      output.subarray(0, 3).equals(Buffer.from("ID3")) || output[0] === 0xff,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
