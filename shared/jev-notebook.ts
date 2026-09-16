import { z } from "zod";

export const notebookCheckKindSchema = z.enum([
  "organization",
  "relationships",
  "learningGoal",
  "chatQuestion",
  "flashcardQuality",
]);
export type NotebookCheckKind = z.infer<typeof notebookCheckKindSchema>;
export const sourceRoleSchema = z.enum([
  "syllabus",
  "teaching",
  "personal-notes",
  "unknown",
]);
export type SourceRole = z.infer<typeof sourceRoleSchema>;
export const notebookSourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: z.enum(["course", "supplement"]),
  excerpt: z.string().max(1200),
  role: sourceRoleSchema.optional(),
});
export type NotebookSource = z.infer<typeof notebookSourceSchema>;
export const reportItemSchema = z.object({
  id: z.string(),
  kind: notebookCheckKindSchema,
  label: z.string().max(240),
  subject: z.string().max(2200).optional(),
  probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
  detail: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  confidenceNote: z.string(),
  sourceIds: z.array(z.string().uuid()).max(12),
  excerpts: z
    .array(
      z.object({ sourceId: z.string().uuid(), text: z.string().max(6000) }),
    )
    .max(12),
  status: z.enum(["advisory", "supported", "unresolved"]),
});
export type NotebookReportItem = z.infer<typeof reportItemSchema>;
export const notebookReportSchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  createdAt: z.string(),
  inputFingerprint: z.string(),
  stale: z.boolean(),
  model: z.string(),
  examinedSources: z
    .array(
      z.object({
        sourceId: z.string().uuid(),
        title: z.string(),
        text: z.string().max(6000),
      }),
    )
    .max(12)
    .optional(),
  elapsedMs: z.number().nonnegative().optional(),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
  request: z
    .object({
      learningGoal: z.string(),
      chatQuestion: z.string(),
      format: z.string(),
    })
    .optional(),
  selectedSourceIds: z.array(z.string().uuid()).max(12),
  selectedDeckId: z.string().uuid().optional(),
  sampledCoverage: z.object({
    examinedSources: z.number().int(),
    selectedSources: z.number().int(),
    examinedCharacters: z.number().int(),
    note: z.string(),
  }),
  items: z.array(reportItemSchema).max(80),
  feedback: z
    .record(z.string(), z.enum(["helpful", "not-helpful"]))
    .default({}),
});
export type NotebookReport = z.infer<typeof notebookReportSchema>;
export const notebookRunSchema = z.object({
  selectedSourceIds: z
    .array(z.string().uuid())
    .min(1)
    .max(12)
    .refine((v) => new Set(v).size === v.length, "Select each source once."),
  checks: z
    .array(notebookCheckKindSchema)
    .min(1)
    .max(5)
    .refine((v) => new Set(v).size === v.length, "Select each check once."),
  learningGoal: z.string().max(2000).default(""),
  format: z
    .enum(["explanation", "calculation", "application"])
    .default("explanation"),
  chatQuestion: z.string().max(2000).default(""),
  deckId: z.string().uuid().optional(),
});
export type NotebookRun = z.infer<typeof notebookRunSchema>;
export const notebookStateSchema = z.object({
  notebookId: z.string().uuid(),
  sources: z.array(notebookSourceSchema),
  decks: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  reports: z.array(notebookReportSchema).max(20),
  active: z
    .object({
      runId: z.string(),
      state: z.enum(["running", "cancelling"]),
      startedAt: z.string(),
    })
    .nullable(),
  available: z.boolean(),
});
export type NotebookState = z.infer<typeof notebookStateSchema>;
