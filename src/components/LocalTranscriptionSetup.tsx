import { InkInput, InkSelect, InkButton } from "./InkControl";
import { responseError } from "../response-error";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, ExternalLink, LoaderCircle, Square } from "lucide-react";
import {
  type TranscriptionModel,
  type TranscriptionStatus,
} from "../../shared/transcription";
import "./local-transcription-setup.css";

type StatusPayload = TranscriptionStatus & {
  activity?: {
    running: boolean;
    progress: string;
    error?: string;
    notebookId?: string;
  };
};

export type LocalTranscriptionSetupProps = {
  onChanged?: () => Promise<void>;
  compact?: boolean;
};

const modelLabels: Record<TranscriptionModel, string> = {
  "large-v3": "large-v3 · detailed transcription",
  "large-v3-turbo": "large-v3-turbo · faster transcription",
};

function setupMessage(
  status: StatusPayload | null,
  selectedModel: TranscriptionModel,
) {
  if (!status) return "Status unavailable. Try checking again.";
  if (!status.python)
    return "Python is not available. Install Python, then check again.";
  if (!status.runtime)
    return "The isolated transcription runtime is not prepared yet.";
  if (!status.models[selectedModel])
    return `The ${selectedModel} model has not been downloaded yet.`;
  return status.message || "Local transcription is ready.";
}

export function LocalTranscriptionSetup({
  onChanged,
  compact = false,
}: LocalTranscriptionSetupProps) {
  const [model, setModel] = useState<TranscriptionModel>("large-v3");
  const [gpu, setGpu] = useState(false);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const statusRequestInFlight = useRef(false);

  const loadStatus = useCallback(async (showLoading = false) => {
    if (statusRequestInFlight.current) return;
    statusRequestInFlight.current = true;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/transcription/status");
      if (!response.ok)
        throw new Error(
          await responseError(
            response,
            "Could not check local transcription status.",
          ),
        );
      const next = (await response.json()) as StatusPayload;
      if (!mounted.current) return;
      setStatus(next);
      setActive(Boolean(next.activity?.running));
      setError(next.activity?.error || "");
    } catch (reason: unknown) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not check local transcription status.",
        );
    } finally {
      if (showLoading && mounted.current) setLoading(false);
      statusRequestInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadStatus(true);
    return () => {
      mounted.current = false;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => void loadStatus(), 2500);
    return () => window.clearInterval(interval);
  }, [active, loadStatus]);

  const prepare = async () => {
    setError("");
    setActive(true);
    try {
      const response = await fetch("/api/transcription/prepare", {
        method: "POST",
        headers: { "x-sennibook": "1", "Content-Type": "application/json" },
        body: JSON.stringify({ model, gpu }),
      });
      if (!response.ok)
        throw new Error(
          await responseError(
            response,
            "Local transcription setup could not start.",
          ),
        );
      await loadStatus();
      try {
        await onChanged?.();
      } catch {
        // A notebook refresh can fail while the server-side setup continues;
        // status polling remains the source of truth for this long operation.
      }
    } catch (reason: unknown) {
      setActive(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "Local transcription setup could not start.",
      );
    }
  };

  const cancel = async () => {
    setError("");
    try {
      const response = await fetch("/api/transcription/cancel", {
        method: "POST",
        headers: { "x-sennibook": "1", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok)
        throw new Error(
          await responseError(response, "Setup could not be cancelled."),
        );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Setup could not be cancelled.",
      );
    } finally {
      setActive(false);
      await loadStatus();
    }
  };

  const running = active || Boolean(status?.activity?.running);
  const ready = Boolean(
    status?.runtime && status.models[model] && (!gpu || status.cuda),
  );
  const activityIsTranscription = Boolean(status?.activity?.notebookId);
  const progress = activityIsTranscription
    ? status?.activity?.progress || "Transcribing an imported recording…"
    : status?.activity?.progress || "Preparing local transcription…";

  return (
    <section
      className={`local-transcription-setup${compact ? " is-compact" : ""}`}
      aria-labelledby="local-transcription-title"
    >
      <div className="local-transcription-heading">
        <div>
          <span className="local-transcription-kicker">
            Local transcription
          </span>
          <h3 id="local-transcription-title">
            Keep recordings on this computer
          </h3>
        </div>
        <span
          className={`local-transcription-state ${ready ? "is-ready" : running ? "is-running" : ""}`}
        >
          {ready
            ? "Ready"
            : running
              ? activityIsTranscription
                ? "Transcribing"
                : "Preparing"
              : "Not ready"}
        </span>
      </div>

      <p className="local-transcription-intro">
        LMBook uses faster-whisper to make timestamped machine transcripts
        locally. This is separate from podcast voices: it helps you search and
        review an imported recording, and does not generate a conversation.
      </p>
      <p className="local-transcription-intro">
        Python is required. The guided preparation creates an isolated runtime
        and downloads the selected model, which can take several GB and needs a
        network connection. Your recordings stay local.
      </p>

      <div className="local-transcription-form">
        <label htmlFor="local-transcription-model">
          <span>Model to prepare</span>
          <InkSelect
            id="local-transcription-model"
            value={model}
            onChange={(event) =>
              setModel(event.target.value as TranscriptionModel)
            }
            disabled={running || loading}
          >
            {(Object.keys(modelLabels) as TranscriptionModel[]).map(
              (option) => (
                <option key={option} value={option}>
                  {modelLabels[option]}
                </option>
              ),
            )}
          </InkSelect>
        </label>
        <label className="local-transcription-gpu">
          <InkInput
            type="checkbox"
            checked={gpu}
            disabled={running || loading}
            onChange={(event) => setGpu(event.target.checked)}
          />
          <span>
            Add NVIDIA GPU support on Windows. Downloads additional runtime
            files (several GB) for faster transcription.
          </span>
        </label>
        <p className="local-transcription-status" role="status">
          {loading
            ? "Checking local setup…"
            : running
              ? progress
              : setupMessage(status, model)}
        </p>
      </div>

      {error && (
        <p className="local-transcription-error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}
      {!loading && status?.activity?.error && !error && (
        <p className="local-transcription-error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {status.activity.error}
        </p>
      )}

      <div className="local-transcription-actions">
        {running ? (
          <InkButton
            type="button"
            className="button"
            onClick={() => void cancel()}
          >
            <Square size={15} fill="currentColor" aria-hidden="true" /> Cancel
            {activityIsTranscription ? " local work" : " setup"}
          </InkButton>
        ) : (
          <InkButton
            type="button"
            className="button primary"
            onClick={() => void prepare()}
            disabled={loading || ready}
          >
            {loading ? (
              <LoaderCircle
                className="local-transcription-spin"
                size={16}
                aria-hidden="true"
              />
            ) : null}
            {ready ? "Model ready" : "Prepare local transcription"}
          </InkButton>
        )}
        {!ready && !running && (
          <InkButton
            type="button"
            className="local-transcription-recheck"
            onClick={() => void loadStatus(true)}
            disabled={loading}
          >
            Check again
          </InkButton>
        )}
      </div>

      <div className="local-transcription-links">
        <a
          href="https://www.python.org/downloads/"
          target="_blank"
          rel="noreferrer"
        >
          Install official Python <ExternalLink size={13} aria-hidden="true" />
        </a>
        <a
          href="https://github.com/SYSTRAN/faster-whisper"
          target="_blank"
          rel="noreferrer"
        >
          Read faster-whisper documentation{" "}
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
