import { z } from "zod";

export const transcriptionModelSchema = z.enum(["large-v3", "large-v3-turbo"]);
export type TranscriptionModel = z.infer<typeof transcriptionModelSchema>;
export const transcriptionOptionsSchema = z.object({
  model: transcriptionModelSchema.default("large-v3"),
  language: z.enum(["auto", "en", "nl"]).default("auto"),
  device: z.enum(["auto", "cuda", "cpu"]).default("auto"),
});
export type TranscriptionOptions = z.infer<typeof transcriptionOptionsSchema>;
const seconds = z
  .number()
  .finite()
  .min(0)
  .max(24 * 60 * 60);
export const transcriptSchema = z
  .object({
    provider: z.literal("faster-whisper"),
    model: transcriptionModelSchema,
    revision: z.string().min(1).max(200),
    language: z.string().min(1).max(30),
    device: z.string().min(1).max(100),
    createdAt: z.string().max(100),
    segments: z
      .array(
        z
          .object({
            start: seconds,
            end: seconds,
            text: z.string().min(1).max(12000),
            originalText: z.string().min(1).max(12000).optional(),
            editedAt: z.string().datetime().optional(),
            words: z
              .array(
                z
                  .object({
                    start: seconds,
                    end: seconds,
                    text: z.string().max(500),
                    probability: z.number().finite().min(0).max(1).optional(),
                  })
                  .strict()
                  .refine(
                    (word) => word.end >= word.start,
                    "Word timestamps are out of order.",
                  ),
              )
              .max(3000)
              .optional(),
          })
          .strict()
          .refine(
            (s) => s.end >= s.start,
            "Transcript timestamps are out of order.",
          ),
      )
      .min(1)
      .max(50000),
  })
  .strict();
export type Transcript = z.infer<typeof transcriptSchema>;
export type TranscriptionStatus = {
  python: boolean;
  runtime: boolean;
  cuda: boolean;
  models: Record<TranscriptionModel, boolean>;
  message: string;
};
export function timestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  return `${hours ? `${hours}:` : ""}${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function transcriptText(transcript: Transcript) {
  return transcript.segments
    .map(
      (segment) =>
        `[${timestamp(segment.start)} – ${timestamp(segment.end)}] ${segment.text.trim()}`,
    )
    .join("\n\n");
}
