import { z } from "zod";

export const ocrOptionsSchema = z
  .object({
    language: z.enum(["eng", "nld", "eng+nld"]).default("eng"),
    mode: z.enum(["missing", "all"]).default("missing"),
  })
  .strict();
export type OcrOptions = z.infer<typeof ocrOptionsSchema>;

const ocrPageSchema = z
  .object({
    number: z.number().int().min(1).max(600),
    text: z.string().max(1_000_000),
    method: z.enum(["text-layer", "ocr"]),
    confidence: z.number().finite().min(0).max(100).optional(),
    width: z.number().int().positive().max(100_000).optional(),
    height: z.number().int().positive().max(100_000).optional(),
  })
  .strict();

export const ocrResultSchema = z
  .object({
    engine: z.literal("tesseract.js"),
    version: z.literal("7.0.0"),
    modelRevision: z.string().min(1).max(300),
    language: z.enum(["eng", "nld", "eng+nld"]),
    createdAt: z.string().datetime(),
    pages: z.array(ocrPageSchema).max(600),
  })
  .strict()
  .superRefine((result, context) => {
    const total = result.pages.reduce((sum, page) => sum + page.text.length, 0);
    if (total > 1_000_000)
      context.addIssue({
        code: "custom",
        message: "OCR output exceeds one million characters.",
        path: ["pages"],
      });
    for (let index = 1; index < result.pages.length; index++) {
      if (result.pages[index].number <= result.pages[index - 1].number)
        context.addIssue({
          code: "custom",
          message: "OCR pages must be strictly ordered.",
          path: ["pages", index, "number"],
        });
    }
  });
export type OcrResult = z.infer<typeof ocrResultSchema>;

export function ocrText(result: OcrResult) {
  return result.pages
    .map((page) => `[Page ${page.number}]\n${page.text}`)
    .join("\n\n");
}
