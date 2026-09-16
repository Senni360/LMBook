import { z } from "zod";

export const jevFeatureSchema = z.enum([
  "notebookReview",
  "connections",
  "searchRanking",
]);
export type JevFeature = z.infer<typeof jevFeatureSchema>;

export const defaultJevFeatures: Record<JevFeature, boolean> = {
  notebookReview: false,
  connections: false,
  searchRanking: false,
};

export const jevFeaturesSchema = z.object({
  notebookReview: z.boolean().default(false),
  connections: z.boolean().default(false),
  searchRanking: z.boolean().default(false),
});

export const jevConnectionStatusSchema = z.object({
  configured: z.boolean(),
  source: z.enum(["saved", "environment", "none"]),
});
export type JevConnectionStatus = z.infer<typeof jevConnectionStatusSchema>;

export const jevChoiceQuestionSchema = z.object({
  type: z.literal("choice"),
  instructions: z.string().trim().min(1).max(4000),
  criteria: z.record(
    z.string().trim().min(1).max(500),
    z.string().max(2000).nullable(),
  ),
});
export type JevChoiceQuestion = z.infer<typeof jevChoiceQuestionSchema>;

export const jevEvaluateRequestSchema = z.object({
  state: z.unknown(),
  model: z.literal("jev-latest").default("jev-latest"),
  questions: z
    .record(z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/), jevChoiceQuestionSchema)
    .refine(
      (questions) =>
        Object.keys(questions).length > 0 &&
        Object.keys(questions).length <= 32,
      "Provide between 1 and 32 questions.",
    ),
});
export type JevEvaluateRequest = z.infer<typeof jevEvaluateRequestSchema>;

export const jevChoiceAnswerSchema = z.object({
  type: z.literal("choice"),
  choice: z.string().min(1),
  probabilities: z.record(z.string(), z.number().finite().min(0).max(1)),
  confidence: z.number().finite().min(0).max(1),
});
export const jevEvaluateResponseSchema = z.object({
  model: z.string().min(1).max(200),
  answers: z.record(z.string(), jevChoiceAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export type JevEvaluateResponse = z.infer<typeof jevEvaluateResponseSchema>;

export type JevDecision = {
  choices: Record<
    string,
    {
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  >;
  model: string;
  usage: JevEvaluateResponse["usage"];
};

export type JevConnectionResult = {
  ok: boolean;
  message: string;
};
