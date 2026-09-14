import { createHash } from "node:crypto";
import path from "node:path";
import { jobs, startJob } from "./jobs.ts";
import { getNotebook, saveNotebook, originalsDir, dataDir } from "./store.ts";
import { verifyOriginal } from "./source-originals.ts";
import { recognizeDocument } from "./ocr.ts";
import { ocrOptionsSchema, ocrResultSchema, ocrText } from "../shared/ocr.ts";
import type { z } from "zod";

let activeNotebook: string | undefined;

/** One local document at a time keeps large page images from competing for memory. */
export function startSourceOcr(
  notebookId: string,
  sourceId: string,
  options: z.infer<typeof ocrOptionsSchema>,
) {
  if (activeNotebook || jobs.has(notebookId))
    throw Object.assign(
      new Error(
        activeNotebook
          ? "Another document is being read. Wait for it to finish or cancel it in that notebook."
          : "This notebook already has work running.",
      ),
      { status: 409 },
    );
  const notebook = getNotebook(notebookId);
  const source = notebook.sources.find((item) => item.id === sourceId);
  const attachment = source?.attachment;
  if (
    !source ||
    !attachment ||
    !["application/pdf", "image/png", "image/jpeg"].includes(
      attachment.mediaType,
    )
  )
    throw new Error(
      "Choose an imported PDF, PNG or JPEG to read scanned text.",
    );

  source.processing = {
    task: "ocr",
    status: "recognizing",
    progress: "Preparing to read printed text…",
  };
  saveNotebook(notebook);
  activeNotebook = notebookId;
  startJob(notebookId, source.processing.progress!, async (signal) => {
    let lastSave = 0;
    try {
      const filename = await verifyOriginal(originalsDir, attachment, signal);
      const result = ocrResultSchema.parse(
        await recognizeDocument(
          {
            filename,
            mediaType: attachment.mediaType,
            sha256: attachment.sha256,
            options,
            cacheDir: path.join(dataDir, "ocr-cache"),
          },
          signal,
          (message) => {
            const progress = message.slice(0, 500);
            const job = jobs.get(notebookId);
            if (job) job.label = progress;
            if (Date.now() - lastSave < 1500) return;
            lastSave = Date.now();
            const latest = getNotebook(notebookId);
            const target = latest.sources.find((item) => item.id === sourceId);
            if (target?.processing) {
              target.processing.progress = progress;
              saveNotebook(latest);
            }
          },
        ),
      );
      signal.throwIfAborted();
      const extracted = result.pages.some((page) => page.text.trim())
        ? ocrText(result)
        : "";
      if (extracted.length > 1_000_000)
        throw new Error(
          "This document exceeds the source text limit. Split it into smaller sections.",
        );
      const latest = getNotebook(notebookId);
      const target = latest.sources.find((item) => item.id === sourceId);
      if (!target || target.attachment?.sha256 !== attachment.sha256)
        throw new Error(
          "The source changed while its pages were being read. Start again from the current file.",
        );
      const empty = result.pages.filter((page) => !page.text.trim());
      const uncertain = result.pages.filter(
        (page) => page.method === "ocr" && (page.confidence ?? 100) < 70,
      );
      target.ocr = result;
      target.ocrCandidate = false;
      target.text = extracted;
      target.extractedSha256 = createHash("sha256")
        .update(extracted)
        .digest("hex");
      target.extraction = `Local ${result.engine} ${result.version}; ${result.language}; page text with original retained`;
      target.extractionWarnings = [
        "Scanned text may contain recognition or reading-order errors. Check names, numbers and important passages against the original. Diagram relationships and equations are not interpreted.",
        ...(empty.length
          ? [
              `${empty.length} page(s) yielded no readable text; their visual content remains in the original.`,
            ]
          : []),
        ...(uncertain.length
          ? [
              `Recognition was uncertain on ${uncertain.length} page(s). Review those pages against the original.`,
            ]
          : []),
      ];
      delete target.processing;
      latest.coverage = [];
      saveNotebook(latest);
    } catch (error) {
      const message = signal.aborted
        ? "Reading cancelled. The original and previous text are saved. Start again to reuse completed pages."
        : error instanceof Error
          ? error.message
          : "This document could not be read.";
      const latest = getNotebook(notebookId);
      const target = latest.sources.find((item) => item.id === sourceId);
      if (target) {
        target.processing = {
          task: "ocr",
          status: "failed",
          error: message.slice(0, 5000),
        };
        saveNotebook(latest);
      }
    } finally {
      activeNotebook = undefined;
    }
  });
}
