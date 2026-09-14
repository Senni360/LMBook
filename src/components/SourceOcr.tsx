import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, ScanText, Square } from "lucide-react";
import type { Source } from "../../shared/model";
import type { OcrOptions } from "../../shared/ocr";
import "./source-ocr.css";

export type SourceOcrProps = {
  source: Source;
  notebookId: string;
  language: "en" | "nl";
  disabled: boolean;
  onChanged: () => Promise<void>;
};

async function responseError(response: Response, fallback: string) {
  let message = fallback;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim())
      message = body.error;
  } catch {
    // Preserve the fallback for empty or non-JSON errors.
  }
  return message;
}

const languageLabels: Record<OcrOptions["language"], string> = {
  eng: "English",
  nld: "Dutch",
  "eng+nld": "English + Dutch",
};

export function SourceOcr({
  source,
  notebookId,
  language,
  disabled,
  onChanged,
}: SourceOcrProps) {
  const [expanded, setExpanded] = useState(
    Boolean(source.ocrCandidate || source.processing?.task === "ocr"),
  );
  const [ocrLanguage, setOcrLanguage] = useState<OcrOptions["language"]>(
    language === "nl" ? "nld" : "eng",
  );
  const [mode, setMode] = useState<OcrOptions["mode"]>("missing");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const previousOcrState = useRef({
    candidate: source.ocrCandidate,
    task: source.processing?.task,
    status: source.processing?.status,
  });

  const processing = source.processing;
  const isOcrTask = processing?.task === "ocr";
  const isRunning = isOcrTask && processing.status === "recognizing";
  const isFailed = isOcrTask && processing.status === "failed";
  const pages = source.ocr?.pages || [];
  const ocrPages = pages.filter((page) => page.method === "ocr").length;
  const textLayerPages = pages.filter(
    (page) => page.method === "text-layer",
  ).length;
  const lowSignalPages = pages.filter(
    (page) =>
      page.method === "ocr" &&
      typeof page.confidence === "number" &&
      page.confidence < 70,
  ).length;
  const canStart = !disabled && !submitting && !isRunning;
  const showPanel = expanded || isRunning;

  useEffect(() => {
    const previous = previousOcrState.current;
    const candidateStarted = !previous.candidate && source.ocrCandidate;
    const taskOrStatusChanged =
      previous.task !== processing?.task ||
      previous.status !== processing?.status;
    if (candidateStarted || taskOrStatusChanged) setExpanded(true);
    previousOcrState.current = {
      candidate: source.ocrCandidate,
      task: processing?.task,
      status: processing?.status,
    };
  }, [processing?.status, processing?.task, source.ocrCandidate]);

  const startOcr = async () => {
    if (!canStart) return;
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(source.id)}/ocr`,
        {
          method: "POST",
          headers: { "x-sennibook": "1", "Content-Type": "application/json" },
          body: JSON.stringify({ language: ocrLanguage, mode }),
        },
      );
      if (!response.ok) {
        throw new Error(await responseError(response, "OCR could not start."));
      }
      try {
        await onChanged();
      } catch {
        setNotice(
          "OCR started. The source refresh is taking longer than expected.",
        );
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "OCR could not start.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOcr = async () => {
    setError("");
    try {
      const response = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/cancel`,
        {
          method: "POST",
          headers: { "x-sennibook": "1", "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "OCR could not be cancelled."),
        );
      try {
        await onChanged();
      } catch {
        setNotice(
          "OCR cancellation was requested. The source refresh is taking longer than expected.",
        );
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "OCR could not be cancelled.",
      );
    }
  };

  if (!showPanel) {
    return (
      <div className="source-ocr-quiet">
        <span className="source-ocr-quiet-copy">
          <ScanText size={15} aria-hidden="true" />
          <span>
            <strong>{source.ocr ? "Read scanned text" : "Read pages"}</strong>
            <small>OCR reads printed text from page images.</small>
          </span>
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
        >
          {source.ocr ? "Read scanned text" : "Read pages"}
        </button>
      </div>
    );
  }

  return (
    <section
      className="source-ocr"
      aria-labelledby={`source-ocr-title-${source.id}`}
    >
      <div className="source-ocr-heading">
        <div>
          <span className="source-ocr-kicker">Printed text recognition</span>
          <h3 id={`source-ocr-title-${source.id}`}>
            Improve text from scanned pages
          </h3>
        </div>
        {!isRunning && (
          <button
            type="button"
            className="source-ocr-collapse"
            onClick={() => setExpanded(false)}
            disabled={disabled}
          >
            Hide
          </button>
        )}
      </div>
      <p className="source-ocr-intro">
        OCR reads printed text from page images. It cannot interpret diagrams or
        equations, so check those against the original document.
      </p>
      {(source.ocrCandidate || isRunning) && !source.text.trim() && (
        <p className="source-ocr-pending-note" role="status">
          No readable text is available yet. OCR will add text after the pages
          are recognized.
        </p>
      )}

      {isRunning && (
        <div className="source-ocr-progress" role="status" aria-live="polite">
          <LoaderCircle
            className="source-ocr-spin"
            size={17}
            aria-hidden="true"
          />
          <span>{processing?.progress || "Recognizing pages…"}</span>
        </div>
      )}

      {isFailed && processing?.error && (
        <p className="source-ocr-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {processing.error}
        </p>
      )}
      {error && (
        <p className="source-ocr-error" role="alert">
          <CircleAlert size={15} aria-hidden="true" /> {error}
        </p>
      )}
      {notice && (
        <p className="source-ocr-notice" role="status">
          {notice}
        </p>
      )}

      {!isRunning && (
        <div className="source-ocr-controls">
          <label>
            <span>OCR language</span>
            <select
              value={ocrLanguage}
              onChange={(event) =>
                setOcrLanguage(event.target.value as OcrOptions["language"])
              }
              disabled={disabled || submitting}
            >
              {(Object.keys(languageLabels) as OcrOptions["language"][]).map(
                (option) => (
                  <option key={option} value={option}>
                    {languageLabels[option]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            <span>Pages to process</span>
            <select
              value={mode}
              onChange={(event) =>
                setMode(event.target.value as OcrOptions["mode"])
              }
              disabled={disabled || submitting}
            >
              <option value="missing">Only pages without usable text</option>
              <option value="all">All pages</option>
            </select>
          </label>
        </div>
      )}

      {mode === "all" && !isRunning && (
        <p className="source-ocr-warning">
          All pages will be OCR'd and replace the current extracted text when
          complete. Earlier episodes keep their saved source versions.
        </p>
      )}

      {source.ocr && !isRunning && (
        <div className="source-ocr-result" role="status">
          <strong>Last OCR result</strong>
          <span>
            {ocrPages} OCR {ocrPages === 1 ? "page" : "pages"} ·{" "}
            {textLayerPages} text-layer{" "}
            {textLayerPages === 1 ? "page" : "pages"}
          </span>
          {lowSignalPages > 0 && (
            <p className="source-ocr-low-signal">
              {lowSignalPages} OCR{" "}
              {lowSignalPages === 1 ? "page needs" : "pages need"} a closer
              review because the recognition signal was low.
            </p>
          )}
        </div>
      )}

      <div className="source-ocr-actions">
        {isRunning ? (
          <button
            type="button"
            className="button"
            onClick={() => void cancelOcr()}
            disabled={submitting}
          >
            <Square size={15} fill="currentColor" aria-hidden="true" /> Cancel
            reading
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            onClick={() => void startOcr()}
            disabled={!canStart}
          >
            {submitting && (
              <LoaderCircle
                className="source-ocr-spin"
                size={16}
                aria-hidden="true"
              />
            )}
            {submitting
              ? "Starting…"
              : isFailed
                ? "Try reading again"
                : source.ocr
                  ? "Read pages again"
                  : "Read pages"}
          </button>
        )}
      </div>
    </section>
  );
}
