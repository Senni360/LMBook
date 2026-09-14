import { z } from "zod";
import { sourceAttachmentSchema, type Source } from "./model.ts";

export const FLASHCARD_MODEL = "gpt-5.6-luna";
const text = z.string().min(1).max(4000);
export const flashcardSchema = z
  .object({
    id: z.string().uuid(),
    front: text,
    back: text,
    group: z.string().max(200).default(""),
    example: z.string().max(4000).default(""),
    transcription: z
      .object({
        location: z.string().trim().min(1).max(300),
        note: z.string().trim().min(1).max(1000),
      })
      .strict()
      .optional(),
    evidence: z
      .array(
        z
          .object({
            sourceId: z.string().uuid(),
            quote: z.string().min(1).max(12000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const flashSourceSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(500),
    text: z.string().max(1_000_000),
    kind: z.enum(["course", "supplement"]),
    createdAt: z.string().max(100),
    attachment: sourceAttachmentSchema.optional(),
  })
  .strict();
export const flashDeckSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(180),
    createdAt: z.string().max(100),
    revision: z.number().int().min(0),
    mode: z.enum(["vocabulary", "concepts"]),
    origin: z.enum(["generated", "imported"]),
    prompt: z.string().max(12000),
    model: z.string().max(100),
    frontLabel: z.string().min(1).max(60),
    backLabel: z.string().min(1).max(60),
    sources: z.array(flashSourceSchema).min(1).max(150),
    cards: z.array(flashcardSchema).max(2000),
    reviewedIds: z.array(z.string().uuid()).max(2000),
    coverageConfirmed: z.boolean(),
    expectedCount: z.number().int().min(1).max(2000).optional(),
    status: z.enum(["generating", "ready", "error"]),
    error: z.string().max(5000).optional(),
  })
  .strict();
export type FlashCard = z.infer<typeof flashcardSchema>;
export type FlashDeck = z.infer<typeof flashDeckSchema>;
export type FlashSource = z.infer<typeof flashSourceSchema>;

export function snapshotFlashSource(source: Source): FlashSource {
  return flashSourceSchema.parse({
    id: source.id,
    title: source.title,
    text: source.text,
    kind: source.kind,
    createdAt: source.createdAt,
    attachment: source.attachment,
  });
}

/** Only Unicode composition and surrounding whitespace are ignored. No linguistic substitutions. */
export function flashAnswerMatches(input: string, answer: string) {
  return (
    !!input.trim() &&
    input.normalize("NFC").trim() === answer.normalize("NFC").trim()
  );
}

export function cardEvidenceIssues(
  card: FlashCard,
  deck: Pick<FlashDeck, "sources" | "mode">,
): string[] {
  const issues: string[] = [];
  for (const evidence of card.evidence) {
    const source = deck.sources.find((s) => s.id === evidence.sourceId);
    if (!source || !source.text.includes(evidence.quote))
      issues.push("The quoted passage does not match the saved source.");
  }
  if (
    deck.mode === "vocabulary" &&
    !card.transcription &&
    !card.evidence.some(
      (e) => e.quote.includes(card.front) && e.quote.includes(card.back),
    )
  )
    issues.push(
      "The exact word and translation must both occur in the same quoted passage. Check the pairing against the original.",
    );
  return [...new Set(issues)];
}

export function flashDeckReport(deck: FlashDeck) {
  const ids = new Set(deck.cards.map((card) => card.id));
  const invalid = deck.cards
    .filter((card) => cardEvidenceIssues(card, deck).length > 0)
    .map((c) => c.id);
  const reviewed = new Set(
    deck.reviewedIds.filter((id) => ids.has(id) && !invalid.includes(id)),
  );
  const seen = new Map<string, number>();
  for (const card of deck.cards) {
    const key = JSON.stringify([card.front, card.back]);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const repeatedPairs = [...seen.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  const countMatches =
    deck.expectedCount === undefined ||
    deck.expectedCount === deck.cards.length;
  const ready =
    deck.status === "ready" &&
    deck.cards.length > 0 &&
    invalid.length === 0 &&
    ids.size === deck.cards.length &&
    (deck.mode === "concepts" ||
      (reviewed.size === deck.cards.length &&
        deck.coverageConfirmed &&
        deck.expectedCount !== undefined &&
        countMatches));
  return {
    manualTranscriptions: deck.cards.filter((card) => !!card.transcription)
      .length,
    total: deck.cards.length,
    reviewed: reviewed.size,
    invalid,
    repeatedPairs,
    countMatches,
    ready,
  };
}

export function validateFlashDeck(deck: FlashDeck) {
  if (
    new Set(deck.sources.map((s) => s.id)).size !== deck.sources.length ||
    new Set(deck.cards.map((c) => c.id)).size !== deck.cards.length
  )
    throw new Error("The flashcard deck contains duplicate identifiers.");
  if (deck.reviewedIds.some((id) => !deck.cards.some((c) => c.id === id)))
    throw new Error("The flashcard review refers to a missing entry.");
  if (new Set(deck.reviewedIds).size !== deck.reviewedIds.length)
    throw new Error("The flashcard review contains duplicate entries.");
  if (deck.coverageConfirmed && !flashDeckReport(deck).ready)
    throw new Error(
      "The flashcard deck claims a completed review but still has unresolved entries.",
    );
}
