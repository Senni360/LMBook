import { z } from "zod";

export const backgroundAssistantModeSchema = z.enum(["ask", "obvious", "full"]);
export type BackgroundAssistantMode = z.infer<
  typeof backgroundAssistantModeSchema
>;

export const backgroundAssistantSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  mode: backgroundAssistantModeSchema.default("ask"),
  notifications: z.boolean().default(true),
  selectedPaths: z.array(z.string().min(1).max(500)).max(150).default([]),
  excludedPaths: z.array(z.string().min(1).max(500)).max(150).default([]),
});
export type BackgroundAssistantSettings = z.infer<
  typeof backgroundAssistantSettingsSchema
>;

export const backgroundAssistantProposalSchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  vaultId: z.string().uuid(),
  sourcePath: z.string(),
  targetPath: z.string(),
  relationship: z.string().max(200),
  explanation: z.string().max(1200),
  sourceQuote: z.string().max(1200),
  targetQuote: z.string().max(1200),
  addition: z.string(),
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  targetRevision: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "applied", "dismissed", "undone", "failed"]),
  createdAt: z.string(),
  appliedAt: z.string().optional(),
  dismissedAt: z.string().optional(),
  appliedBlock: z.string().optional(),
  jevCheck: z
    .object({
      verdict: z.enum(["supported", "uncertain", "unsupported", "unavailable"]),
      confidence: z.number().nullable(),
      checkedAt: z.string(),
      message: z.string(),
    })
    .nullable()
    .optional(),
  error: z.string().optional(),
});
export type BackgroundAssistantProposal = z.infer<
  typeof backgroundAssistantProposalSchema
>;

export const backgroundAssistantActivitySchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  kind: z.enum([
    "queued",
    "scanned",
    "proposed",
    "applied",
    "dismissed",
    "undone",
    "failed",
  ]),
  message: z.string(),
  proposalId: z.string().uuid().optional(),
  createdAt: z.string(),
});
export type BackgroundAssistantActivity = z.infer<
  typeof backgroundAssistantActivitySchema
>;

export const backgroundAssistantStatusSchema = z.object({
  state: z.enum(["idle", "queued", "running", "paused", "error"]),
  message: z.string().optional(),
  lastRunAt: z.string().optional(),
});
export type BackgroundAssistantStatus = z.infer<
  typeof backgroundAssistantStatusSchema
>;

export type BackgroundAssistantSnapshot = {
  settings: BackgroundAssistantSettings;
  proposals: BackgroundAssistantProposal[];
  activity: BackgroundAssistantActivity[];
  running: boolean;
};
