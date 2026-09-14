import { z } from "zod";

const MAX_CONTEXT_CHARS = 3_000_000_000;
const boundedChars = z.number().int().nonnegative().max(MAX_CONTEXT_CHARS);

export const contextPassageSchema = z
  .object({
    sourceId: z.string().uuid(),
    start: boundedChars,
    end: boundedChars,
    sourceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  })
  .strict()
  .refine((passage) => passage.end >= passage.start, {
    message: "A context passage must end at or after its start.",
  });

export const contextSummarySchema = z
  .object({
    scope: z.enum(["complete", "selected"]),
    totalChars: boundedChars,
    selectedChars: boundedChars,
    totalSourceCount: z.number().int().nonnegative().max(10_000),
    consultedSourceCount: z.number().int().nonnegative().max(10_000),
    passages: z.array(contextPassageSchema).max(2_000),
    unmatchedQueryIds: z.array(z.string().min(1).max(200)).max(500),
  })
  .strict()
  .refine((summary) => summary.selectedChars <= summary.totalChars, {
    message: "Selected context cannot exceed total context.",
  })
  .refine(
    (summary) => summary.consultedSourceCount <= summary.totalSourceCount,
    { message: "Consulted sources cannot exceed total sources." },
  );

export type ContextPassage = z.infer<typeof contextPassageSchema>;
export type ContextSummary = z.infer<typeof contextSummarySchema>;
