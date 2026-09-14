import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { settingsSchema, uid, type Episode } from "../shared/model.ts";
import { savedEpisodeSettingsSchema } from "../shared/speech.ts";
import { readWav } from "../server/core.ts";

const dataDir = mkdtempSync(path.join(tmpdir(), "sennibook-quality-"));
process.env.DATA_DIR = dataDir;
process.env.CARTESIA_API_KEY = "test-local-quality-key";
const store = await import("../server/store.ts");
const { finalizeCartesiaWav, synthesizeCartesia } =
  await import("../server/cartesia.ts");
const { chapterFingerprint } = await import("../server/audio-cache.ts");
const { createAudio } = await import("../server/jobs.ts");
const { createEpisodeRevision } =
  await import("../server/episode-revisions.ts");
const { createNotebookBundle, importNotebookBundle } =
  await import("../server/notebook-bundle.ts");
after(() => {
  store.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function wav(rate: number, streaming = false) {
  const buffer = Buffer.alloc(44 + rate * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(streaming ? 0xffffffff : buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(streaming ? 0xffffffff : buffer.length - 44, 40);
  for (let i = 44; i < buffer.length; i += 2) buffer.writeInt16LE(1234, i);
  return buffer;
}
function episode(): Episode {
  return {
    id: uid(),
    title: "Quality check",
    createdAt: new Date().toISOString(),
    settings: settingsSchema.parse({
      ttsProvider: "cartesia",
      cartesiaVoiceA: uid(),
      cartesiaVoiceB: uid(),
      cartesiaSampleRate: 24000,
    }),
    sources: [],
    objectives: [],
    status: "draft",
    progress: "Ready",
    chapters: [
      {
        id: uid(),
        title: "First chapter",
        summary: "A short check",
        minutes: 5,
        objectiveIds: [],
        turns: [
          {
            speaker: "A",
            text: "A complete sentence for the first host.",
            sourceIds: [],
          },
          {
            speaker: "B",
            text: "A complete sentence for the second host.",
            sourceIds: [],
          },
        ],
      },
    ],
  };
}

test("defaults new audio to 44.1 kHz while legacy episodes retain their 24 kHz cache identity", () => {
  assert.equal(settingsSchema.parse({}).cartesiaSampleRate, 44100);
  assert.equal(savedEpisodeSettingsSchema.parse({}).cartesiaSampleRate, 24000);
  const n = store.newNotebook("Legacy quality");
  const old = episode();
  const legacy = { ...old.settings } as Partial<typeof old.settings>;
  delete legacy.cartesiaSampleRate;
  old.settings = legacy as typeof old.settings;
  n.episodes = [old];
  store.db
    .prepare("INSERT INTO notebooks VALUES (?, ?)")
    .run(n.id, JSON.stringify(n));
  const loaded = store.getNotebook(n.id);
  assert.equal(loaded.settings.cartesiaSampleRate, 44100);
  assert.equal(loaded.episodes[0].settings.cartesiaSampleRate, 24000);
  const c = old.chapters[0],
    s = old.settings;
  const previousFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        turns: c.turns.map((t) => ({ speaker: t.speaker, text: t.text })),
        language: s.language,
        provider: "cartesia",
        model: s.cartesiaModel,
        voiceA: s.cartesiaVoiceA,
        voiceB: s.cartesiaVoiceB,
        speed: s.cartesiaSpeed,
        segmentation: "per-turn-v1",
      }),
    )
    .digest("hex");
  assert.equal(
    chapterFingerprint(c, loaded.episodes[0].settings),
    previousFingerprint,
  );
  assert.notEqual(
    chapterFingerprint(c, {
      ...loaded.episodes[0].settings,
      cartesiaSampleRate: 44100,
    }),
    previousFingerprint,
  );
});

test("finalizes both WAV rates without altering samples and rejects unexpected or truncated audio", () => {
  for (const rate of [24000, 44100] as const) {
    const input = wav(rate, true);
    const result = readWav(finalizeCartesiaWav(input, rate));
    assert.equal(result.format.readUInt32LE(4), rate);
    assert.ok(result.pcm.equals(input.subarray(44)));
    assert.equal(result.pcm.length / result.format.readUInt32LE(8), 1);
  }
  assert.throws(
    () => finalizeCartesiaWav(wav(24000)),
    /Expected mono 44.1 kHz/,
  );
  assert.throws(
    () => finalizeCartesiaWav(wav(44100).subarray(0, 100)),
    /incomplete audio/,
  );
});

test("Cartesia requests the selected native rate and maps the correct host voice", async () => {
  const originalFetch = globalThis.fetch;
  const s = { ...episode().settings, cartesiaSampleRate: 44100 as const };
  const requests: any[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    return new Response(wav(body.output_format.sample_rate, true));
  };
  try {
    const high = readWav(await synthesizeCartesia("B: Keep these words.", s));
    const old = readWav(
      await synthesizeCartesia("A: Keep these words.", {
        ...s,
        cartesiaSampleRate: 24000,
      }),
    );
    assert.equal(high.format.readUInt32LE(4), 44100);
    assert.equal(old.format.readUInt32LE(4), 24000);
    assert.equal(requests[0].voice, s.cartesiaVoiceB);
    assert.equal(requests[1].voice, s.cartesiaVoiceA);
    assert.equal(requests[0].transcript, "Keep these words.");
    assert.deepEqual(
      requests.map((r) => r.output_format.sample_rate),
      [44100, 24000],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a higher-quality revision renders separately, preserves original bytes, and survives backup/restore", async () => {
  const n = store.newNotebook("Quality revisions");
  const old = episode();
  n.episodes = [old];
  store.saveNotebook(n);
  const synthesize = async (_text: string, settings: typeof old.settings) =>
    wav(settings.cartesiaSampleRate);
  await createAudio(
    n.id,
    old.id,
    false,
    new AbortController().signal,
    synthesize,
  );
  const saved = store.getNotebook(n.id);
  const original = saved.episodes[0];
  const originalPath = path.join(
    store.audioDir,
    original.chapters[0].audioFile!,
  );
  const originalBytes = readFileSync(originalPath);
  const revision = createEpisodeRevision(saved, original);
  revision.settings.cartesiaSampleRate = 44100;
  saved.episodes.unshift(revision);
  store.saveNotebook(saved);
  await createAudio(
    n.id,
    revision.id,
    false,
    new AbortController().signal,
    synthesize,
  );
  const finished = store.getNotebook(n.id);
  assert.equal(finished.episodes[0].status, "complete");
  assert.ok(readFileSync(originalPath).equals(originalBytes));
  const high = readWav(
    readFileSync(
      path.join(store.audioDir, finished.episodes[0].chapters[0].audioFile!),
    ),
  );
  assert.equal(high.format.readUInt32LE(4), 44100);
  assert.equal(high.pcm.length / high.format.readUInt32LE(8), 2);
  const parts: Buffer[] = [];
  for await (const part of createNotebookBundle(finished, store.audioDir))
    parts.push(Buffer.from(part));
  const zipPath = path.join(dataDir, "quality.zip");
  writeFileSync(zipPath, Buffer.concat(parts));
  const imported = await importNotebookBundle(
    zipPath,
    path.join(dataDir, "restored-audio"),
  );
  assert.deepEqual(
    imported.notebook.episodes.map((e) => e.settings.cartesiaSampleRate),
    [44100, 24000],
  );
  const restored = readWav(
    readFileSync(
      path.join(
        dataDir,
        "restored-audio",
        imported.notebook.episodes[0].chapters[0].audioFile!,
      ),
    ),
  );
  assert.ok(restored.pcm.equals(high.pcm));
});
