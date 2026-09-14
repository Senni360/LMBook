import test, { after } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  settingsSchema,
  type Episode,
  type Notebook,
} from "../shared/model.ts";

const dataDir = mkdtempSync(path.join(tmpdir(), "sennibook-jobs-"));
process.env.DATA_DIR = dataDir;

const { createAudio } = await import("../server/jobs.ts");
const store = await import("../server/store.ts");
const cache = await import("../server/audio-cache.ts");

after(() => {
  store.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function wav(samples = 24000) {
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(48000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

function notebook(text = "A factual sentence."): Notebook {
  const settings = settingsSchema.parse({
    language: "en",
    voiceA: "Kore",
    voiceB: "Charon",
    ttsModel: "gemini-2.5-flash-tts",
  });
  const chapterId = randomUUID();
  const episode: Episode = {
    id: randomUUID(),
    title: "Cache test",
    createdAt: new Date().toISOString(),
    settings,
    sources: [],
    objectives: [],
    status: "draft",
    progress: "",
    chapters: [
      {
        id: chapterId,
        title: "Chapter one",
        minutes: 1,
        objectiveIds: [],
        summary: "",
        turns: [
          { speaker: "A", text, sourceIds: [] },
          { speaker: "B", text: "A second sentence.", sourceIds: [] },
        ],
      },
    ],
  };
  const n = store.newNotebook(`Cache test ${randomUUID()}`);
  n.episodes = [episode];
  store.saveNotebook(n);
  return n;
}

function chapter(n: Notebook) {
  return store.getNotebook(n.id).episodes[0].chapters[0];
}

test("repairs a corrupt segment and rewrites the final without repeating valid work", async () => {
  const n = notebook();
  let calls = 0;
  const synthesize = async () => {
    calls += 1;
    return wav(24000 + calls);
  };
  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    synthesize,
  );
  assert.equal(calls, 1);

  const first = chapter(n);
  const cacheDir = path.join(store.audioDir, first.id);
  writeFileSync(path.join(cacheDir, "0.wav"), Buffer.from("truncated"));
  rmSync(path.join(store.audioDir, first.audioFile!), { force: true });
  const changed = store.getNotebook(n.id);
  delete changed.episodes[0].chapters[0].audioFile;
  delete changed.episodes[0].chapters[0].audioSeconds;
  changed.episodes[0].status = "error";
  store.saveNotebook(changed);

  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    synthesize,
  );
  assert.equal(
    calls,
    2,
    "only the corrupt segment should be synthesized again",
  );
  const repaired = chapter(n);
  assert.equal(store.getNotebook(n.id).episodes[0].status, "complete");
  assert.ok(repaired.audioFile);
  assert.ok(
    cache.readCachedFinal(path.join(store.audioDir, repaired.audioFile!)),
  );
  assert.ok(cache.readCachedSegment(cacheDir, 0));
});

test("quarantines a cache whose script fingerprint changed", async () => {
  const n = notebook();
  let calls = 0;
  const synthesize = async () => {
    calls += 1;
    return wav();
  };
  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    synthesize,
  );
  const before = calls;
  const changed = store.getNotebook(n.id);
  changed.episodes[0].chapters[0].turns[0].text =
    "A materially different script.";
  delete changed.episodes[0].chapters[0].audioFile;
  delete changed.episodes[0].chapters[0].audioSeconds;
  changed.episodes[0].status = "error";
  store.saveNotebook(changed);

  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    synthesize,
  );
  assert.equal(calls, before + 1, "mismatched segments must not be reused");
  const current = chapter(n);
  const manifest = cache.readManifest(path.join(store.audioDir, current.id));
  assert.equal(
    manifest?.fingerprint,
    cache.chapterFingerprint(
      current,
      current
        ? store.getNotebook(n.id).episodes[0].settings
        : settingsSchema.parse({}),
    ),
  );
  assert.ok(
    readdirSync(store.audioDir).some((name) =>
      name.startsWith(`${current.id}.stale-`),
    ),
  );
});

test("reuses a valid legacy locked segment while marking it unverified", async () => {
  const n = notebook();
  const current = chapter(n);
  const cacheDir = path.join(store.audioDir, current.id);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(path.join(cacheDir, "0.wav"), wav());
  const changed = store.getNotebook(n.id);
  changed.episodes[0].chapters[0].audioLocked = true;
  store.saveNotebook(changed);
  let calls = 0;

  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    async () => {
      calls += 1;
      return wav();
    },
  );
  assert.equal(calls, 0);
  assert.equal(cache.readManifest(cacheDir)?.legacy, true);
  assert.equal(store.getNotebook(n.id).episodes[0].status, "complete");
});

test("does not accept provider output after cancellation", async () => {
  const n = notebook();
  const controller = new AbortController();
  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    controller.signal,
    async () => {
      controller.abort();
      return wav();
    },
  );
  const current = chapter(n);
  assert.equal(store.getNotebook(n.id).episodes[0].status, "error");
  assert.match(store.getNotebook(n.id).episodes[0].error || "", /cancelled/i);
  assert.equal(
    existsSync(path.join(store.audioDir, current.id, "0.wav")),
    false,
  );
  assert.equal(
    cache.readCachedFinal(path.join(store.audioDir, `${current.id}.wav`)),
    undefined,
  );
});

test("regenerates a missing final chapter file from valid cached segments", async () => {
  const n = notebook();
  let calls = 0;
  const synthesize = async () => {
    calls += 1;
    return wav();
  };
  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    synthesize,
  );
  const before = calls;
  const first = chapter(n);
  rmSync(path.join(store.audioDir, first.audioFile!), { force: true });
  await createAudio(
    n.id,
    n.episodes[0].id,
    false,
    new AbortController().signal,
    synthesize,
  );
  assert.equal(calls, before, "valid cached segments avoid a paid retry");
  const repaired = chapter(n);
  assert.ok(
    cache.readCachedFinal(path.join(store.audioDir, repaired.audioFile!)),
  );
  assert.equal(store.getNotebook(n.id).episodes[0].status, "complete");
});
