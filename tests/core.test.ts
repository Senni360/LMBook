import test from "node:test";
import assert from "node:assert/strict";
import {
  combineWavs,
  parseJSON,
  readWav,
  speechChunks,
  validEvidence,
  exportMarkdown,
} from "../server/core.ts";
import {
  settingsSchema,
  estimateSpeech,
  type Notebook,
} from "../shared/model.ts";
const n: Notebook = {
  id: "n",
  title: "Study",
  description: "",
  example: false,
  createdAt: "",
  updatedAt: "",
  settings: settingsSchema.parse({}),
  sources: [
    {
      id: "s1",
      title: "Original",
      kind: "course",
      createdAt: "",
      text: "A meaningful qualification\n changes the argument.",
    },
  ],
  objectives: [],
  coverage: [],
  episodes: [],
  messages: [],
};
test("grounding rejects invented quotes and nonexistent sources while tolerating extraction whitespace", () => {
  assert.deepEqual(
    validEvidence(
      [
        {
          sourceId: "s1",
          quote: "A meaningful qualification changes the argument.",
        },
        { sourceId: "s1", quote: "Something the source never stated." },
        {
          sourceId: "other",
          quote: "A meaningful qualification changes the argument.",
        },
      ],
      n,
    ),
    [
      {
        sourceId: "s1",
        quote: "A meaningful qualification changes the argument.",
      },
    ],
  );
});
test("speech chunking respects UTF-8 budgets and retains every word with speaker identity", () => {
  const text = Array.from({ length: 500 }, (_, i) => `één${i}`).join(" ");
  const chunks = speechChunks(
    [
      { speaker: "A", text, sourceIds: [] },
      { speaker: "B", text: "Een tweede spreker.", sourceIds: [] },
    ],
    200,
  );
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => Buffer.byteLength(c) <= 200));
  const reconstructed = chunks
    .join("\n")
    .split("\n")
    .filter((l) => l.startsWith("A:"))
    .map((l) => l.slice(3))
    .join(" ");
  assert.equal(reconstructed, text);
  assert.ok(chunks.at(-1)?.endsWith("B: Een tweede spreker."));
  assert.throws(
    () =>
      speechChunks(
        [{ speaker: "A", text: "x".repeat(500), sourceIds: [] }],
        100,
      ),
    /word/,
  );
});
function wav(samples: number) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}
test("WAV concatenation rewrites the header and calculates actual playback duration", () => {
  const combined = combineWavs([wav(24000), wav(48000)]);
  assert.equal(combined.seconds, 3);
  assert.equal(readWav(combined.buffer).pcm.length, 144000);
  assert.equal(combined.buffer.readUInt32LE(4), combined.buffer.length - 8);
  assert.throws(() => readWav(Buffer.from("bad audio")), /unsupported/);
  assert.throws(() => readWav(wav(10).subarray(0, 47)), /incomplete/);
});
test("parses fenced model JSON but never silently repairs malformed answers", () => {
  assert.deepEqual(parseJSON('```json\n{"answer":"yes"}\n```'), {
    answer: "yes",
  });
  assert.throws(() => parseJSON("Here is invalid output"), /invalid response/);
});
test("exports source provenance and keeps cost estimates model-specific", () => {
  assert.match(exportMarkdown(n), /Source ID: s1/);
  assert.match(exportMarkdown(n), /A meaningful qualification/);
  assert.ok(Math.abs(estimateSpeech(60, "gemini-2.5-flash-tts") - 0.9) < 1e-9);
  assert.ok(
    Math.abs(estimateSpeech(60, "gemini-3.1-flash-tts-preview") - 1.8) < 1e-9,
  );
});
test("Markdown retains an episode's evidence after current sources and goals are removed", () => {
  const notebook = structuredClone(n);
  notebook.episodes = [
    {
      id: "episode-1",
      title: "Saved argument",
      createdAt: "2026-09-14",
      settings: n.settings,
      sources: n.sources,
      objectives: [
        {
          id: "goal-1",
          text: "Explain the original qualification",
          kind: "goal",
          important: true,
        },
      ],
      status: "draft",
      progress: "Ready",
      chapters: [
        {
          id: "chapter-1",
          title: "Qualification",
          summary: "Preserve it",
          minutes: 5,
          objectiveIds: ["goal-1"],
          turns: [
            { speaker: "A", text: "Keep the condition.", sourceIds: ["s1"] },
          ],
        },
      ],
    },
  ];
  notebook.sources = [];
  notebook.objectives = [];
  const markdown = exportMarkdown(notebook);
  assert.match(markdown, /Episode sources \(saved snapshot\)/);
  assert.match(markdown, /A meaningful qualification/);
  assert.match(markdown, /Explain the original qualification/);
  assert.match(markdown, /Text SHA-256: [a-f0-9]{64}/);
});
