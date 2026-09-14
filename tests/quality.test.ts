import test from "node:test";
import assert from "node:assert/strict";
import {
  EPISODE_QUALITY_CHAPTER,
  evaluateChapterQuality,
  evaluateEpisodeQuality,
  type QualityWarningCode,
} from "../shared/quality.ts";
import {
  settingsSchema,
  type Chapter,
  type Episode,
  type Objective,
  type Turn,
} from "../shared/model.ts";

const text = (count: number, word = "woord") =>
  Array.from({ length: count }, () => word).join(" ");

function turn(
  speaker: "A" | "B",
  words: number,
  change: Partial<Turn> = {},
): Turn {
  return {
    speaker,
    text: text(words),
    sourceIds: ["s1"],
    ...change,
  };
}

function chapter(change: Partial<Chapter> = {}): Chapter {
  return {
    id: "chapter-1",
    title: "Chapter",
    minutes: 1,
    objectiveIds: ["o1"],
    summary: "",
    turns: [turn("A", 145)],
    ...change,
  };
}

function objective(id: string): Objective {
  return { id, text: id, kind: "goal", important: false };
}

function episode(change: Partial<Episode> = {}): Episode {
  return {
    id: "episode-1",
    title: "Episode",
    createdAt: "",
    settings: settingsSchema.parse({ minutes: 5 }),
    chapters: [chapter()],
    objectives: [objective("o1")],
    sources: [
      { id: "s1", title: "Source", text: "", kind: "course", createdAt: "" },
    ],
    status: "draft",
    progress: "",
    ...change,
  };
}

function codes(warnings: { code: QualityWarningCode }[]): QualityWarningCode[] {
  return warnings.map((warning) => warning.code);
}

test("warns when estimated chapter duration is outside the 65–140% range", () => {
  const short = evaluateChapterQuality(
    chapter({ turns: [turn("A", 90)] }),
    episode(),
  );
  const long = evaluateChapterQuality(
    chapter({ turns: [turn("A", 205)] }),
    episode(),
  );
  assert.equal(
    codes(short).filter((code) => code === "DURATION_MISMATCH").length,
    1,
  );
  assert.equal(
    codes(long).filter((code) => code === "DURATION_MISMATCH").length,
    1,
  );
  assert.match(short[0].message, /short/);
  assert.match(long[0].message, /long/);
});

test("checks severe speaker imbalance only once there are at least 150 words", () => {
  const warning = evaluateChapterQuality(
    chapter({ turns: [turn("A", 130), turn("B", 20)] }),
    episode(),
  );
  assert.ok(codes(warning).includes("SPEAKER_IMBALANCE"));
  const belowThreshold = evaluateChapterQuality(
    chapter({ turns: [turn("A", 129), turn("B", 20)] }),
    episode(),
  );
  assert.ok(!codes(belowThreshold).includes("SPEAKER_IMBALANCE"));
});

test("detects repeated whole English and Dutch canned phrases, not ordinary single words", () => {
  const english = chapter({
    turns: [
      turn("A", 20, { text: "In this episode we begin." }),
      turn("B", 20, { text: "IN THIS EPISODE we continue." }),
      turn("A", 20, { text: "in this episode we conclude." }),
    ],
  });
  const dutch = chapter({
    turns: [
      turn("A", 20, { text: "In deze aflevering beginnen we." }),
      turn("B", 20, { text: "IN DEZE AFLEVERING gaan we verder." }),
      turn("A", 20, { text: "in deze aflevering ronden we af." }),
    ],
  });
  assert.ok(
    evaluateChapterQuality(english, episode()).some(
      (warning) =>
        warning.code === "CANNED_PHRASE" &&
        warning.message.includes("in this episode"),
    ),
  );
  assert.ok(
    evaluateChapterQuality(dutch, episode()).some(
      (warning) =>
        warning.code === "CANNED_PHRASE" &&
        warning.message.includes("in deze aflevering"),
    ),
  );
  const normal = chapter({
    turns: [
      turn("A", 20, { text: "Actually, this is useful." }),
      turn("B", 20, { text: "Actually, yes." }),
    ],
  });
  assert.ok(
    !codes(evaluateChapterQuality(normal, episode())).includes("CANNED_PHRASE"),
  );
});

test("reports missing and unknown source IDs as structural checks, never semantic fact-checks", () => {
  const warnings = evaluateChapterQuality(
    chapter({
      turns: [
        turn("A", 10, { sourceIds: [] }),
        turn("B", 10, { sourceIds: ["s-unknown"] }),
      ],
    }),
    episode(),
  );
  assert.ok(codes(warnings).includes("MISSING_SOURCE_REFERENCE"));
  assert.ok(codes(warnings).includes("UNKNOWN_SOURCE_REFERENCE"));
  const sourceMessages = warnings
    .filter((warning) => warning.code.endsWith("SOURCE_REFERENCE"))
    .map((warning) => warning.message)
    .join(" ");
  assert.match(sourceMessages, /Structural source check/);
  assert.match(sourceMessages, /not a semantic fact-check/);
});

test("compares planned chapter objectives with the episode snapshot and tolerates legacy episodes", () => {
  const warnings = evaluateEpisodeQuality(
    episode({ objectives: [objective("o1"), objective("o2")] }),
  );
  const objectiveWarning = warnings.find(
    (warning) => warning.code === "OBJECTIVE_GAP",
  );
  assert.ok(objectiveWarning);
  assert.equal(objectiveWarning.chapterId, EPISODE_QUALITY_CHAPTER);
  assert.match(objectiveWarning.message, /o2/);

  const legacy = episode({ objectives: undefined, sources: undefined });
  const legacyWarnings = evaluateEpisodeQuality(legacy);
  assert.ok(!codes(legacyWarnings).includes("OBJECTIVE_GAP"));
  assert.ok(!codes(legacyWarnings).includes("UNKNOWN_SOURCE_REFERENCE"));
});

test("an empty chapter is advisory and does not throw", () => {
  const warnings = evaluateChapterQuality(
    chapter({ turns: [], minutes: 5 }),
    episode(),
  );
  assert.ok(codes(warnings).includes("DURATION_MISMATCH"));
  assert.ok(!codes(warnings).includes("SPEAKER_IMBALANCE"));
});
