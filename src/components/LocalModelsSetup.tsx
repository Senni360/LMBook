import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, LoaderCircle, RefreshCw, Square } from "lucide-react";
import type {
  LocalModelStatus,
  LocalModelProgress,
  LocalModelCheckResult,
} from "../../shared/local-models";
import { aiApi } from "../ai-api";
import { InkButton } from "./InkControl";
import { LocalTranscriptionSetup } from "./LocalTranscriptionSetup";
import "./ai-setup.css";

const memory = (bytes: number | null) =>
  bytes === null ? "Not detected" : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const fitLabels = {
  good: "Good fit",
  possible: "May be slower",
  "not-recommended": "Limited memory",
  unavailable: "Unavailable",
};
export function LocalModelsSetup() {
  const [status, setStatus] = useState<LocalModelStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState("");
  const [notice, setNotice] = useState("");
  const [checkResult, setCheckResult] = useState<LocalModelCheckResult | null>(
    null,
  );
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const next = await aiApi<LocalModelStatus>(
        "/local-models/status",
        "GET",
        undefined,
        request.signal,
      );
      if (!request.signal.aborted && mounted.current) setStatus(next);
    } catch (e) {
      if (!request.signal.aborted && mounted.current)
        setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [load]);
  useEffect(() => {
    if (!status?.activity.running) return;
    const request = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const activity = await aiApi<{
          running: boolean;
          cancelling: boolean;
          progress: LocalModelProgress | null;
          error: string | null;
        }>("/local-models/activity", "GET", undefined, request.signal);
        if (request.signal.aborted) return;
        setStatus(
          (current) =>
            current && {
              ...current,
              downloading: activity.running,
              activity: {
                running: activity.running,
                cancelling: activity.cancelling,
                progress: activity.progress?.progress ?? null,
                message:
                  activity.progress?.message || "Preparing local search…",
                error: activity.error,
              },
            },
        );
        if (!activity.running) {
          setNotice(activity.progress?.message || "");
          void load();
        }
      } catch (e) {
        if (!request.signal.aborted) setError((e as Error).message);
      } finally {
        if (!request.signal.aborted) timer = setTimeout(poll, 1000);
      }
    };
    timer = setTimeout(poll, 500);
    return () => {
      request.abort();
      clearTimeout(timer);
    };
  }, [status?.activity.running, load]);
  async function act(
    action:
      | "prepare"
      | "cancel"
      | "check"
      | "enable"
      | "disable"
      | "refresh"
      | "advice",
  ) {
    setBusy(action);
    setError("");
    setNotice("");
    if (action === "check") setCheckResult(null);
    controller.current?.abort();
    if (action === "cancel")
      setStatus(
        (current) =>
          current && {
            ...current,
            activity: {
              ...current.activity,
              cancelling: true,
              message: "Stopping setup…",
            },
          },
      );
    try {
      if (action === "advice") {
        const result = await aiApi<{ advice: string }>(
          "/local-models/advice",
          "POST",
        );
        if (mounted.current) setAdvice(result.advice);
      } else if (action === "check") {
        const result = await aiApi<LocalModelCheckResult>(
          "/local-models/check",
          "POST",
        );
        if (mounted.current) setCheckResult(result);
      } else if (action !== "refresh") {
        await aiApi(
          `/local-models/${action === "enable" || action === "disable" ? "enabled" : action}`,
          "POST",
          action === "enable" || action === "disable"
            ? { enabled: action === "enable" }
            : {},
        );
        if (mounted.current && action === "cancel") {
          setNotice(
            "Setup cancelled. Downloaded files are kept; retry when you’re ready.",
          );
          setStatus(
            (current) =>
              current && {
                ...current,
                downloading: false,
                activity: {
                  ...current.activity,
                  running: false,
                  cancelling: false,
                  error: null,
                },
              },
          );
        }
        if (mounted.current && action === "prepare")
          setStatus(
            (current) =>
              current && {
                ...current,
                downloading: true,
                activity: {
                  running: true,
                  cancelling: false,
                  progress: null,
                  error: null,
                  message: "Preparing local AI setup…",
                },
              },
          );
      }
      if (mounted.current) void load();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current)
        setBusy((current) => (current === action ? "" : current));
    }
  }
  const h = status?.hardware;
  const running = !!status?.activity.running;
  return (
    <div className="ai-connection">
      <div className="ai-hardware">
        <div className="ai-status-line">
          <strong>This computer</strong>
          <InkButton
            className="button quiet"
            disabled={!!busy}
            onClick={() => void act("refresh")}
          >
            <RefreshCw size={15} />
            Recheck
          </InkButton>
        </div>
        {h ? (
          <dl>
            <dt>Processor</dt>
            <dd>
              {h.cpuModel} · {h.logicalCores} logical cores
            </dd>
            <dt>Memory</dt>
            <dd>
              {memory(h.memoryBytes)} total · {memory(h.freeMemoryBytes)}{" "}
              currently free
            </dd>
            <dt>Graphics</dt>
            <dd>
              {h.gpu
                ? `${h.gpu.name} · ${memory(h.gpu.memoryBytes)} video memory`
                : "No NVIDIA GPU detected. Local search uses the CPU."}
            </dd>
          </dl>
        ) : (
          <p role="status">Checking memory, processor, and local runtime…</p>
        )}
        <p className="fine-print">
          These recommendations use detected hardware and bounded workloads.
          Available memory and speed vary with other apps.
        </p>
      </div>
      <section className="ai-local-model" aria-labelledby="local-e5-title">
        <div className="ai-status-line">
          <h3 id="local-e5-title">Search notes by meaning</h3>
          {status && (
            <span
              className={`badge ${status.fit === "good" ? "covered" : "unmapped"}`}
            >
              {fitLabels[status.fit]}
            </span>
          )}
        </div>
        <p>
          Multilingual E5 small finds related passages even when you use
          different words. Works in Dutch, English, and German. Uses the CPU,
          leaving your graphics card free.
        </p>
        {status && <p className="fine-print">{status.fitExplanation}</p>}
        <p className="fine-print">
          About 500 MB of model files, plus the isolated Python runtime and
          dependencies. Notes stay on this computer. Enable it here, then choose
          local search in your vault’s note finder.
        </p>
        {!status?.python && status && (
          <p className="fine-print">
            Python is needed for setup.{" "}
            <a
              href="https://www.python.org/downloads/"
              target="_blank"
              rel="noreferrer"
            >
              Install Python
            </a>
            , then recheck this computer.
          </p>
        )}
        <div className="ai-actions">
          {status && !running && (
            <p className="local-model-readiness" role="status">
              <strong>
                {status.downloaded
                  ? "Model files downloaded"
                  : "Model files not installed"}
              </strong>
              {status.downloaded && (
                <>
                  {" "}
                  ·{" "}
                  {status.runtimeReady
                    ? "Runtime available"
                    : "Runtime needs a check"}{" "}
                  ·{" "}
                  {status.enabled
                    ? "Local search enabled"
                    : "Local search disabled"}
                </>
              )}
            </p>
          )}
          {!running && status?.downloaded && (
            <InkButton
              className="button"
              disabled={!!busy}
              onClick={() => void act("check")}
            >
              {busy === "check" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {busy === "check" ? "Checking model…" : "Check model"}
            </InkButton>
          )}
          {status?.ready && !running ? (
            <InkButton
              className={`button ${status.enabled ? "" : "primary"}`}
              disabled={!!busy}
              onClick={() => void act(status.enabled ? "disable" : "enable")}
            >
              <Check size={16} />
              {status.enabled ? "Disable local search" : "Enable local search"}
            </InkButton>
          ) : (
            !running &&
            !status?.downloaded && (
              <InkButton
                className="button primary"
                disabled={!!busy || !status?.python}
                onClick={() => void act("prepare")}
              >
                <Download size={16} />
                Download & set up
              </InkButton>
            )
          )}
          {!running && status?.downloaded && !status.ready && (
            <InkButton
              className="button primary"
              disabled={!!busy || !status.python}
              onClick={() => void act("prepare")}
            >
              <RefreshCw size={16} />
              Repair setup
            </InkButton>
          )}
          {running && (
            <InkButton
              className="button"
              disabled={busy === "cancel" || status?.activity.cancelling}
              onClick={() => void act("cancel")}
            >
              <Square size={15} />
              {busy === "cancel" || status?.activity.cancelling
                ? "Stopping setup…"
                : "Cancel setup"}
            </InkButton>
          )}
          {status?.ready && (
            <span className="fine-print">
              {status.enabled
                ? "Enabled · ready when needed"
                : "Installed · disabled"}
            </span>
          )}
        </div>
        {running && (
          <>
            <progress
              aria-label="Local model setup"
              max={1}
              value={status?.activity.progress ?? undefined}
            />
            <p role="status">
              {status?.activity.message || "Preparing local search…"}
            </p>
          </>
        )}
        {status?.activity.error && (
          <p role="alert" className="inline-error">
            {status.activity.error}
          </p>
        )}
        {!running && notice && (
          <p role="status" className="fine-print">
            {notice}
          </p>
        )}
        {!running && checkResult?.ok && (
          <p role="status" className="fine-print">
            The model answered locally in{" "}
            {(checkResult.elapsedMs / 1000).toFixed(1)} seconds. Open a notebook
            → Search by meaning → Enable local search & index to use it on your
            notes.
          </p>
        )}
        {!running && checkResult && !checkResult.ok && (
          <p role="alert" className="inline-error">
            Model check failed
            {checkResult.error ? `: ${checkResult.error}` : "."} You can retry
            the check or use Repair setup.
          </p>
        )}
        {!running && status?.probeError && !checkResult?.ok && (
          <p role="status" className="fine-print">
            Runtime check: {status.probeError} Downloaded model files are still
            present.
          </p>
        )}
      </section>
      <section
        className="ai-local-model"
        aria-labelledby="local-recordings-title"
      >
        <h3 id="local-recordings-title">Turn recordings into text</h3>
        <p>
          Faster-whisper transcribes imported lectures on your computer. Choose
          the faster turbo model or the larger model, then start transcription
          from a recording.
        </p>
        {h && (
          <p className="fine-print">
            {h.gpu && h.gpu.memoryBytes >= 6 * 1024 ** 3
              ? "Your NVIDIA GPU has enough total video memory to consider GPU transcription. The runtime check below also needs to pass; other GPU apps reduce available memory."
              : "Start with CPU transcription. It can be slower than the recording, but does not require a compatible NVIDIA GPU."}{" "}
            {h.memoryBytes && h.memoryBytes < 8 * 1024 ** 3
              ? "With less than 8 GB RAM, larger transcription models are not recommended."
              : "Run one large transcription at a time to leave room for the app."}
          </p>
        )}
        <details>
          <summary>Set up transcription models</summary>
          <LocalTranscriptionSetup />
        </details>
      </section>
      <section className="ai-local-model" aria-labelledby="local-ocr-title">
        <h3 id="local-ocr-title">Read printed scans</h3>
        <p>
          Tesseract OCR is built into LMBook and runs only when you recognize an
          imported scan or image. It needs no GPU or separate account. You
          choose the recognition language on the document.
        </p>
        <p className="fine-print">
          OCR can misread words. Check source text before relying on an exact
          vocabulary pair.
        </p>
      </section>
      <details className="ai-local-model">
        <summary>Ask Luna about this computer</summary>
        <p className="fine-print">
          Send only the processor, memory, GPU details, and model requirements
          to Luna through your Codex subscription. No notes, usernames, or file
          paths are included. Its explanation is advice; the runtime checks
          determine readiness.
        </p>
        <div className="ai-actions">
          <InkButton
            className="button"
            disabled={!!busy || !status}
            onClick={() => void act("advice")}
          >
            {busy === "advice" && <LoaderCircle size={16} className="spin" />}
            {busy === "advice" ? "Asking Luna…" : "Explain my options"}
          </InkButton>
        </div>
        {advice && (
          <div role="status" className="ai-advice">
            {advice}
          </div>
        )}
      </details>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
