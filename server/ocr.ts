import path from "node:path";
import { Worker } from "node:worker_threads";
import {
  ocrOptionsSchema,
  ocrResultSchema,
  type OcrOptions,
  type OcrResult,
} from "../shared/ocr.ts";

const WORKER_PATH =
  process.env.SENNIBOOK_OCR_WORKER || path.resolve("server/ocr-worker.cjs");
const SUPPORTED_MEDIA_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

function abortError() {
  return new Error("OCR cancelled.");
}

export type RecognizeDocumentRequest = {
  filename: string;
  mediaType: string;
  sha256: string;
  options?: OcrOptions | Partial<OcrOptions>;
  cacheDir: string;
};

export async function recognizeDocument(
  request: RecognizeDocumentRequest,
  signal: AbortSignal | undefined,
  onProgress: (message: string) => void,
): Promise<OcrResult> {
  if (signal?.aborted) throw abortError();
  if (!path.isAbsolute(request.filename))
    throw new Error("OCR requires an absolute original file path.");
  if (!path.isAbsolute(request.cacheDir))
    throw new Error("OCR requires an absolute cache directory.");
  if (!SUPPORTED_MEDIA_TYPES.has(request.mediaType))
    throw new Error("Unsupported OCR media type.");
  if (!/^[a-f0-9]{64}$/u.test(request.sha256))
    throw new Error("Invalid OCR source hash.");
  const options = ocrOptionsSchema.parse(request.options || {});
  const worker = new Worker(WORKER_PATH);

  return new Promise<OcrResult>((resolve, reject) => {
    let settled = false;
    let abortListener: (() => void) | undefined;

    const cleanup = () => {
      if (abortListener) {
        signal?.removeEventListener("abort", abortListener);
        abortListener = undefined;
      }
    };

    const settle = async (
      outcome: { value: OcrResult } | { error: unknown },
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        await worker.terminate();
      } catch {
      }
      if ("error" in outcome) reject(outcome.error);
      else resolve(outcome.value);
    };

    worker.on("message", (message: unknown) => {
      if (settled || !message || typeof message !== "object") return;
      const packet = message as {
        type?: string;
        message?: string;
        result?: unknown;
      };
      if (packet.type === "progress" && typeof packet.message === "string") {
        try {
          onProgress(packet.message);
        } catch (error) {
          void settle({ error });
        }
        return;
      }
      if (packet.type === "error") {
        void settle({
          error: new Error(packet.message || "OCR worker failed."),
        });
        return;
      }
      if (packet.type === "result") {
        try {
          const parsed = ocrResultSchema.parse(packet.result);
          if (parsed.pages.length === 0)
            throw new Error("OCR produced no pages.");
          void settle({ value: parsed });
        } catch (error) {
          void settle({ error });
        }
      }
    });
    worker.on("error", (error) => void settle({ error }));
    worker.on("exit", (code) => {
      if (!settled) {
        void settle({
          error: new Error(
            code === 0
              ? "OCR worker exited before returning a result."
              : `OCR worker exited with code ${code}.`,
          ),
        });
      }
    });

    abortListener = () => void settle({ error: abortError() });
    signal?.addEventListener("abort", abortListener, { once: true });
    if (signal?.aborted) {
      abortListener();
      return;
    }
    try {
      worker.postMessage({
        type: "recognize",
        request: {
          ...request,
          options,
        },
      });
    } catch (error) {
      void settle({ error });
    }
  });
}
