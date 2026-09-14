import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { uid } from "../shared/model.ts";

const dataDir = mkdtempSync(path.join(tmpdir(), "sennibook-planning-"));
process.env.DATA_DIR = dataDir;
const { planEpisode } = await import("../server/jobs.ts");
const store = await import("../server/store.ts");
after(() => {
  store.db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function fixture() {
  const n = store.newNotebook("Planning regression");
  n.settings.minutes = 5;
  n.sources = [
    {
      id: uid(),
      title: "Coalition note",
      kind: "course",
      text: "Coalitions require cooperation, but an agreement alone does not establish a party's motive.",
      createdAt: n.createdAt,
    },
  ];
  n.objectives = Array.from({ length: 38 }, (_, i) => ({
    id: uid(),
    kind: "goal" as const,
    important: true,
    text: `Explain required concept ${i + 1}, preserving its qualification.`,
  }));
  const outline = {
    title: "Coalitions",
    chapters: [
      {
        title: "Cooperation and evidence",
        summary:
          "Explain cooperation while distinguishing actions from evidence of motives.",
        objectiveIds: n.objectives.map((o) => o.id),
      },
    ],
  };
  return { n, outline };
}

test("repairs a 3001-character summary and preserves all 38 goals and source snapshots", async () => {
  const { n, outline } = fixture();
  const before = structuredClone(n);
  const oversized = structuredClone(outline);
  oversized.chapters[0].summary = "x".repeat(3001);
  const prompts: string[] = [];
  const stages: string[] = [];
  const episode = await planEpisode(
    n,
    undefined,
    (s) => stages.push(s),
    async (_settings, prompt) => {
      prompts.push(prompt);
      return JSON.stringify(prompts.length === 1 ? oversized : outline);
    },
  );
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /at most 3000 characters/);
  assert.match(prompts[1], /Chapter 1 summary exceeds 3000 characters/);
  assert.ok(prompts[1].includes(oversized.chapters[0].summary));
  assert.ok(stages.some((s) => /Repairing/.test(s)));
  assert.deepEqual(
    episode.chapters[0].objectiveIds,
    n.objectives.map((o) => o.id),
  );
  assert.deepEqual(episode.sources, n.sources);
  assert.deepEqual(episode.objectives, n.objectives);
  assert.deepEqual(n, before);
  assert.equal(episode.chapters[0].summary, outline.chapters[0].summary);
});

test("stops after one failed repair with a readable error and no saved outline", async () => {
  const { n, outline } = fixture();
  outline.chapters[0].summary = "x".repeat(3001);
  let calls = 0;
  await assert.rejects(
    planEpisode(n, undefined, undefined, async () => {
      calls++;
      return JSON.stringify(outline);
    }),
    (error: Error) => {
      assert.match(error.message, /after one automatic repair/);
      assert.match(error.message, /Chapter 1 summary exceeds 3000 characters/);
      assert.doesNotMatch(error.message, /too_big|"origin"|"path"/);
      return true;
    },
  );
  assert.equal(calls, 2);
  assert.equal(n.episodes.length, 0);
  assert.equal(store.listNotebooks().length, 0);
});

test("repairs malformed JSON but rejects a repaired plan that omits learning goals", async () => {
  const { n, outline } = fixture();
  outline.chapters[0].objectiveIds.pop();
  let calls = 0;
  await assert.rejects(
    planEpisode(n, undefined, undefined, async () => {
      return ++calls === 1 ? "{invalid" : JSON.stringify(outline);
    }),
    /omitted 1 learning objective/,
  );
  assert.equal(calls, 2);
  assert.equal(n.episodes.length, 0);
});

test("a valid outline at the summary limit needs no additional provider call", async () => {
  const { n, outline } = fixture();
  outline.chapters[0].summary = "x".repeat(3000);
  let calls = 0;
  const episode = await planEpisode(n, undefined, undefined, async () => {
    calls++;
    return JSON.stringify(outline);
  });
  assert.equal(calls, 1);
  assert.equal(episode.chapters[0].summary.length, 3000);
});

test("provider failures and cancellation never trigger automatic repair calls", async () => {
  const { n, outline } = fixture();
  let calls = 0;
  await assert.rejects(
    planEpisode(n, undefined, undefined, async () => {
      calls++;
      throw new Error("Provider usage limit reached");
    }),
    /usage limit/,
  );
  assert.equal(calls, 1);
  const controller = new AbortController();
  await assert.rejects(
    planEpisode(n, controller.signal, undefined, async () => {
      calls++;
      controller.abort();
      return JSON.stringify(outline);
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 2);
  assert.equal(n.episodes.length, 0);
});
