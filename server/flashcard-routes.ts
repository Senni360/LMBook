import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import path from "node:path";
import { uid } from "../shared/model.ts";
import {
  cardEvidenceIssues,
  flashcardSchema,
  flashDeckReport,
  type FlashDeck,
} from "../shared/flashcards.ts";
import {
  getNotebook,
  saveNotebook,
  originalsDir,
  listNotebooks,
} from "./store.ts";
import { jobs } from "./jobs.ts";
import {
  importFlashText,
  prepareFlashDeck,
  startFlashGeneration,
} from "./flashcards.ts";
import { storeOriginal, verifyOriginal } from "./source-originals.ts";
import { withArtifactMutation } from "./artifact-lock.ts";

const wrap =
  (fn: (req: Request, res: Response) => unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
function load(req: Request, edit = false) {
  const id = z.string().uuid().parse(req.params.id);
  if (edit && jobs.has(id))
    throw Object.assign(
      new Error("Finish or stop generation before changing this notebook."),
      { status: 409 },
    );
  return getNotebook(id);
}
function findDeck(req: Request, decks: FlashDeck[]) {
  const deck = decks.find((d) => d.id === req.params.deckId);
  if (!deck)
    throw Object.assign(new Error("Flashcard deck not found."), {
      status: 404,
    });
  return deck;
}
export function registerFlashcardRoutes(app: Express) {
  // A process restart never leaves a deck claiming work is still running.
  for (const notebook of listNotebooks()) {
    let changed = false;
    for (const deck of notebook.flashcards || [])
      if (deck.status === "generating") {
        deck.status = "error";
        deck.error =
          "Flashcard creation was interrupted. Your sources and earlier decks are saved. Generate a new draft to retry.";
        changed = true;
      }
    if (changed) saveNotebook(notebook);
  }
  app.post(
    "/api/notebooks/:id/flashcards",
    wrap((req, res) => {
      const n = load(req, true);
      const deck = prepareFlashDeck(n, req.body);
      n.flashcards = [...(n.flashcards || []), deck];
      saveNotebook(n);
      startFlashGeneration(n.id, deck);
      res.status(202).json(n);
    }),
  );
  app.post(
    "/api/notebooks/:id/flashcards/import",
    wrap(async (req, res) => {
      load(req, true);
      const input = z
        .object({
          content: z.string().min(1).max(2_000_000),
          filename: z.string().min(1).max(500),
          title: z.string().trim().min(1).max(180),
        })
        .strict()
        .parse(req.body);
      const deck = importFlashText(input.content, input.filename, input.title);
      const saved = await withArtifactMutation(async () => {
        const n = load(req, true);
        if ((n.flashcards?.length || 0) >= 100)
          throw new Error(
            "This notebook already has 100 decks. Use another notebook.",
          );
        const attachment = await storeOriginal(
          originalsDir,
          Buffer.from(input.content, "utf8"),
          input.filename,
          /\.html?$/i.test(input.filename) ? "text/html" : "text/plain",
        );
        const latest = load(req, true);
        deck.sources[0].attachment = attachment;
        latest.flashcards = [...(latest.flashcards || []), deck];
        return saveNotebook(latest);
      });
      res.status(201).json(saved);
    }),
  );
  app.put(
    "/api/notebooks/:id/flashcards/:deckId",
    wrap((req, res) => {
      const n = load(req, true);
      const deck = findDeck(req, n.flashcards || []);
      const update = z
        .discriminatedUnion("action", [
          z
            .object({
              action: z.literal("review"),
              revision: z.number().int(),
              cardId: z.string().uuid(),
              checked: z.boolean(),
            })
            .strict(),
          z
            .object({
              action: z.literal("entry"),
              revision: z.number().int(),
              card: flashcardSchema,
            })
            .strict(),
          z
            .object({
              action: z.literal("remove-entry"),
              revision: z.number().int(),
              cardId: z.string().uuid(),
            })
            .strict(),
          z
            .object({
              action: z.literal("confirm"),
              revision: z.number().int(),
              expectedCount: z.number().int().min(1).max(2000),
            })
            .strict(),
          z
            .object({
              action: z.literal("accept-import"),
              revision: z.number().int(),
            })
            .strict(),
        ])
        .parse(req.body);
      if (deck.status !== "ready")
        throw new Error("Wait for a complete draft before reviewing entries.");
      if (update.revision !== deck.revision)
        throw Object.assign(
          new Error(
            "This deck changed while you were reviewing it. Reload the deck and retry; your edit has not been applied.",
          ),
          { status: 409 },
        );
      if (update.action === "review") {
        const card = deck.cards.find((c) => c.id === update.cardId);
        if (!card) throw new Error("Entry not found.");
        const issues = cardEvidenceIssues(card, deck);
        if (update.checked && issues.length) throw new Error(issues.join(" "));
        deck.reviewedIds = deck.reviewedIds.filter((id) => id !== card.id);
        if (update.checked) deck.reviewedIds.push(card.id);
        deck.coverageConfirmed = false;
      } else if (update.action === "entry") {
        const issues = cardEvidenceIssues(update.card, deck);
        if (issues.length) throw new Error(issues.join(" "));
        const index = deck.cards.findIndex((c) => c.id === update.card.id);
        if (index < 0) {
          if (deck.cards.length >= 2000)
            throw new Error("A deck can contain up to 2,000 entries.");
          deck.cards.push(update.card);
        } else deck.cards[index] = update.card;
        deck.reviewedIds = deck.reviewedIds.filter(
          (id) => id !== update.card.id,
        );
        deck.coverageConfirmed = false;
      } else if (update.action === "remove-entry") {
        if (!deck.cards.some((c) => c.id === update.cardId))
          throw new Error("Entry not found.");
        deck.cards = deck.cards.filter((c) => c.id !== update.cardId);
        deck.reviewedIds = deck.reviewedIds.filter(
          (id) => id !== update.cardId,
        );
        deck.coverageConfirmed = false;
      } else if (update.action === "accept-import") {
        if (deck.origin !== "imported" || deck.revision !== 0)
          throw new Error(
            "Review the changed entries individually before confirming this deck.",
          );
        if (flashDeckReport(deck).invalid.length)
          throw new Error("Resolve the source mismatches first.");
        deck.reviewedIds = deck.cards.map((c) => c.id);
        deck.expectedCount = deck.cards.length;
        deck.coverageConfirmed = true;
      } else {
        const report = flashDeckReport(deck);
        if (
          report.invalid.length ||
          report.reviewed !== report.total ||
          !report.total
        )
          throw new Error(
            "Check every entry against the original before confirming coverage.",
          );
        if (update.expectedCount !== report.total)
          throw new Error(
            `The source count is ${update.expectedCount}, but the deck has ${report.total} entries. Resolve missing or extra entries first.`,
          );
        deck.expectedCount = update.expectedCount;
        deck.coverageConfirmed = true;
      }
      deck.revision++;
      res.json(saveNotebook(n));
    }),
  );
  app.get(
    "/api/notebooks/:id/flashcards/:deckId/export",
    wrap((req, res) => {
      const deck = findDeck(req, load(req).flashcards || []);
      const report = flashDeckReport(deck);
      if (!report.ready)
        throw new Error(
          "Finish the source review before exporting study cards.",
        );
      res.attachment(`flashcards-${deck.id}.json`).json({
        format: "sennibook-flashcards",
        version: 1,
        deck,
        verification: report,
        verificationScope:
          deck.origin === "imported"
            ? "Imported list accepted as answer key; original textbook not checked."
            : deck.mode === "vocabulary"
              ? "Exact text checks plus learner-confirmed pairing and requested coverage of saved sources."
              : "Quoted evidence matches saved sources; generated answers require review.",
      });
    }),
  );
  app.get(
    "/api/notebooks/:id/flashcards/:deckId/sources/:sourceId/original",
    wrap(async (req, res) => {
      const deck = findDeck(req, load(req).flashcards || []);
      const source = deck.sources.find((s) => s.id === req.params.sourceId);
      if (!source?.attachment)
        throw new Error("No original file is saved for this source.");
      const file = await verifyOriginal(originalsDir, source.attachment);
      res.download(path.basename(file), source.attachment.filename, {
        root: originalsDir,
      });
    }),
  );
}
