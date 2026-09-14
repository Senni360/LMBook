import { words, type Chapter, type Episode } from "./model.ts";

/** The identifier used when a warning concerns the episode as a whole. */
export const EPISODE_QUALITY_CHAPTER = "__episode__";
export const WORDS_PER_MINUTE = 145;

export type QualityWarningCode =
  | "DURATION_MISMATCH"
  | "SPEAKER_IMBALANCE"
  | "CANNED_PHRASE"
  | "MISSING_SOURCE_REFERENCE"
  | "UNKNOWN_SOURCE_REFERENCE"
  | "OBJECTIVE_GAP";

export type QualityWarning = {
  chapterId: string;
  code: QualityWarningCode;
  message: string;
};

// These are deliberately multi-word, language-specific formulas. Common
// single words such as "actually" and "eigenlijk" are normal speech.
export const CANNED_PHRASES = [
  "in this episode",
  "let's take a closer look",
  "let us take a closer look",
  "the key takeaway",
  "to put it simply",
  "in deze aflevering",
  "laten we eens kijken",
  "de belangrijkste conclusie",
  "kort samengevat",
  "om het simpel te zeggen",
] as const;

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
}

function countPhrase(text: string, phrase: string): number {
  return text.match(phrasePattern(phrase))?.length ?? 0;
}

function structuralSourceMessage(detail: string): string {
  return `Structural source check: ${detail} This is not a semantic fact-check.`;
}

function sourceIds(turn: { sourceIds?: string[] }): string[] {
  return Array.isArray(turn.sourceIds)
    ? turn.sourceIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

/** Evaluate one chapter. Warnings are advisory and never indicate synthesis should stop. */
export function evaluateChapterQuality(
  chapter: Chapter,
  episode: Pick<Episode, "sources">,
): QualityWarning[] {
  const warnings: QualityWarning[] = [];
  const chapterWords = words(chapter.turns.map((turn) => turn.text).join(" "));
  const estimatedMinutes = chapterWords / WORDS_PER_MINUTE;
  if (
    chapter.minutes > 0 &&
    (estimatedMinutes < chapter.minutes * 0.65 ||
      estimatedMinutes > chapter.minutes * 1.4)
  ) {
    const direction = estimatedMinutes < chapter.minutes ? "short" : "long";
    warnings.push({
      chapterId: chapter.id,
      code: "DURATION_MISMATCH",
      message: `Estimated script duration is ${estimatedMinutes.toFixed(1)} minutes, ${direction} of the ${chapter.minutes.toFixed(1)}-minute target (allowed range: 65–140%).`,
    });
  }

  const speakerWords = {
    A: words(
      chapter.turns
        .filter((turn) => turn.speaker === "A")
        .map((turn) => turn.text)
        .join(" "),
    ),
    B: words(
      chapter.turns
        .filter((turn) => turn.speaker === "B")
        .map((turn) => turn.text)
        .join(" "),
    ),
  };
  const totalSpeakerWords = speakerWords.A + speakerWords.B;
  if (
    totalSpeakerWords >= 150 &&
    Math.max(speakerWords.A, speakerWords.B) / totalSpeakerWords > 0.85
  ) {
    const dominant = speakerWords.A >= speakerWords.B ? "A" : "B";
    const share = Math.round(
      (speakerWords[dominant] / totalSpeakerWords) * 100,
    );
    warnings.push({
      chapterId: chapter.id,
      code: "SPEAKER_IMBALANCE",
      message: `Speaker ${dominant} has ${share}% of the chapter's words (${speakerWords[dominant]} of ${totalSpeakerWords}); the imbalance exceeds 85%.`,
    });
  }

  const transcript = chapter.turns.map((turn) => turn.text).join(" ");
  for (const phrase of CANNED_PHRASES) {
    const count = countPhrase(transcript, phrase);
    if (count >= 3)
      warnings.push({
        chapterId: chapter.id,
        code: "CANNED_PHRASE",
        message: `Canned phrase “${phrase}” occurs ${count} times (threshold: 3).`,
      });
  }

  const missingReferences = chapter.turns.filter(
    (turn) => sourceIds(turn).length === 0,
  ).length;
  if (missingReferences)
    warnings.push({
      chapterId: chapter.id,
      code: "MISSING_SOURCE_REFERENCE",
      message: structuralSourceMessage(
        `${missingReferences} of ${chapter.turns.length} turns have no source reference.`,
      ),
    });

  if (episode.sources) {
    const known = new Set(episode.sources.map((source) => source.id));
    const unknown = new Set(
      chapter.turns.flatMap((turn) =>
        sourceIds(turn).filter((sourceId) => !known.has(sourceId)),
      ),
    );
    if (unknown.size)
      warnings.push({
        chapterId: chapter.id,
        code: "UNKNOWN_SOURCE_REFERENCE",
        message: structuralSourceMessage(
          `${unknown.size} source ID${unknown.size === 1 ? " is" : "s are"} not present in the episode source snapshot (${[...unknown].join(", ")}).`,
        ),
      });
  }

  return warnings;
}

/** Evaluate all chapters and compare their planned objective IDs with the snapshot. */
export function evaluateEpisodeQuality(episode: Episode): QualityWarning[] {
  const warnings = episode.chapters.flatMap((chapter) =>
    evaluateChapterQuality(chapter, episode),
  );
  if (episode.objectives) {
    const planned = new Set(
      episode.chapters.flatMap((chapter) => chapter.objectiveIds),
    );
    const omitted = episode.objectives.filter(
      (objective) => !planned.has(objective.id),
    );
    if (omitted.length)
      warnings.push({
        chapterId: EPISODE_QUALITY_CHAPTER,
        code: "OBJECTIVE_GAP",
        message: `Episode objective coverage check: ${omitted.length} objective${omitted.length === 1 ? " is" : "s are"} omitted from the chapter plan (${omitted.map((objective) => objective.id).join(", ")}).`,
      });
  }
  return warnings;
}
