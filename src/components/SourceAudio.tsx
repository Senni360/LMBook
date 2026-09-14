import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  ChevronDown,
  LoaderCircle,
  Pencil,
  Play,
  Settings2,
} from "lucide-react";
import type { Source } from "../../shared/model";
import {
  timestamp,
  type TranscriptionModel,
  type TranscriptionOptions,
  type TranscriptionStatus,
} from "../../shared/transcription";
import "./source-audio.css";

type TranscriptionStatusPayload = TranscriptionStatus & {
  activity?: {
    running: boolean;
    progress: string;
    error?: string;
    notebookId?: string;
  };
};

type TranscriptEditDraft = {
  sourceId: string;
  index: number;
  text: string;
  expectedText: string;
};

export type SourceAudioProps = {
  source: Source;
  notebookId: string;
  disabled?: boolean;
  initialTime?: number;
  episodeId?: string;
  readOnly?: boolean;
  onChanged: () => Promise<void>;
  onSetup: () => void;
};

const modelLabels: Record<TranscriptionModel, string> = {
  "large-v3": "large-v3 · detailed transcription",
  "large-v3-turbo": "large-v3-turbo · faster transcription",
};

async function responseError(response: Response, fallback: string) {
  let message = fallback;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim())
      message = body.error;
  } catch {
    // Keep the useful fallback for an empty or non-JSON error response.
  }
  return message;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 1) return "Unknown size";
  const units = ["bytes", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function SourceAudio({
  source,
  notebookId,
  disabled = false,
  initialTime,
  episodeId,
  readOnly = false,
  onChanged,
  onSetup,
}: SourceAudioProps) {
  const isSnapshot = Boolean(episodeId) || readOnly;
  const audioRef = useRef<HTMLAudioElement>(null);
  const referencedSegmentRef = useRef<HTMLLIElement>(null);
  const pendingSeek = useRef<{ seconds: number; autoplay: boolean } | null>(
    null,
  );
  const lastSourceId = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [model, setModel] = useState<TranscriptionModel>("large-v3");
  const [language, setLanguage] =
    useState<TranscriptionOptions["language"]>("auto");
  const [device, setDevice] = useState<TranscriptionOptions["device"]>("auto");
  const [status, setStatus] = useState<TranscriptionStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [playbackNotice, setPlaybackNotice] = useState("");
  const [editingSegment, setEditingSegment] =
    useState<TranscriptEditDraft | null>(null);
  const [savingSegment, setSavingSegment] = useState<number | null>(null);
  const [editError, setEditError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [correctionOverrides, setCorrectionOverrides] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (isSnapshot) {
      setStatus(null);
      setStatusLoading(false);
      setStatusError("");
      return;
    }
    let active = true;
    setStatusLoading(true);
    void fetch("/api/transcription/status")
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            await responseError(
              response,
              "Could not check local transcription.",
            ),
          );
        return (await response.json()) as TranscriptionStatusPayload;
      })
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((error: unknown) => {
        if (active)
          setStatusError(
            error instanceof Error
              ? error.message
              : "Could not check local transcription.",
          );
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isSnapshot]);

  useEffect(() => {
    if (
      status &&
      !status.models["large-v3"] &&
      status.models["large-v3-turbo"]
    ) {
      setModel((current) =>
        current === "large-v3" ? "large-v3-turbo" : current,
      );
    }
  }, [status]);

  const applyPendingSeek = () => {
    const audio = audioRef.current;
    const pending = pendingSeek.current;
    if (!audio || !pending || audio.readyState < 1) return;
    const duration =
      Number.isFinite(audio.duration) && audio.duration >= 0
        ? audio.duration
        : undefined;
    audio.currentTime =
      duration === undefined
        ? pending.seconds
        : Math.min(pending.seconds, duration);
    pendingSeek.current = null;
    if (pending.autoplay) {
      void audio.play().then(
        () => setPlaybackNotice(""),
        () =>
          setPlaybackNotice("Press Play on the player to hear this timestamp."),
      );
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    const sourceChanged = lastSourceId.current !== source.id;
    lastSourceId.current = source.id;
    const nextTime =
      typeof initialTime === "number" && Number.isFinite(initialTime)
        ? Math.max(0, initialTime)
        : null;
    pendingSeek.current =
      nextTime === null ? null : { seconds: nextTime, autoplay: false };
    if (!audio) return;

    audio.addEventListener("loadedmetadata", applyPendingSeek);
    // On a source transition, wait for the new metadata event so an old
    // duration is never used for the new recording.
    if (!sourceChanged && audio.readyState >= 1) applyPendingSeek();
    return () => audio.removeEventListener("loadedmetadata", applyPendingSeek);
  }, [initialTime, source.id]);

  useEffect(() => {
    setEditingSegment(null);
    setSavingSegment(null);
    setEditError("");
    setSaveNotice("");
    setCorrectionOverrides({});
  }, [isSnapshot, source.id]);

  const seekTo = (seconds: number) => {
    pendingSeek.current = { seconds: Math.max(0, seconds), autoplay: true };
    setPlaybackNotice("");
    applyPendingSeek();
  };

  const retryPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError("");
    setPlaybackNotice("");
    audio.load();
    if (audio.readyState >= 1) {
      void audio.play().catch(() => {
        setPlaybackNotice(
          "Press Play on the player to try this recording again.",
        );
      });
    }
  };

  const processing = source.processing;
  const isTranscribing = processing?.status === "transcribing";
  const needsTranscript =
    !source.transcript ||
    processing?.status === "pending" ||
    processing?.status === "failed";
  const modelReady = Boolean(status?.runtime && status.models[model]);
  const setupUnavailable = !statusLoading && (!status || !modelReady);
  const actionDisabled =
    disabled || submitting || isTranscribing || statusLoading || isSnapshot;
  const cudaUnavailable = device === "cuda" && status && !status.cuda;
  const correctionDisabled =
    disabled || isTranscribing || savingSegment !== null || isSnapshot;
  const transcriptSegments = source.transcript?.segments;
  const referencedSegmentIndex = useMemo(() => {
    if (
      typeof initialTime !== "number" ||
      !Number.isFinite(initialTime) ||
      initialTime < 0
    )
      return -1;
    return (
      transcriptSegments?.findIndex(
        (segment, index) =>
          initialTime >= segment.start &&
          (initialTime < segment.end ||
            (index === transcriptSegments.length - 1 &&
              initialTime === segment.end)),
      ) ?? -1
    );
  }, [initialTime, transcriptSegments]);

  useEffect(() => {
    if (referencedSegmentIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      const target = referencedSegmentRef.current;
      if (!target) return;
      target.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [source.id, episodeId, initialTime, referencedSegmentIndex]);

  useEffect(() => {
    if (!transcriptSegments) {
      setCorrectionOverrides((current) =>
        Object.keys(current).length ? {} : current,
      );
      return;
    }
    setCorrectionOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const [key, text] of Object.entries(current)) {
        const [sourceId, indexText] = key.split(":");
        const index = Number(indexText);
        if (sourceId !== source.id) {
          delete next[key];
          changed = true;
          continue;
        }
        if (transcriptSegments[index]?.text === text) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [source.transcript]);

  const beginEdit = (index: number, text: string) => {
    if (correctionDisabled) return;
    setEditError("");
    setSaveNotice("");
    setEditingSegment({
      sourceId: source.id,
      index,
      text,
      expectedText: text,
    });
  };

  const saveCorrection = async () => {
    const draft = editingSegment;
    if (!draft || draft.sourceId !== source.id || correctionDisabled) return;
    const text = draft.text.trim();
    if (!text) {
      setEditError("Enter a correction before saving.");
      return;
    }
    setEditError("");
    setSavingSegment(draft.index);
    try {
      const response = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(source.id)}/transcript/segments/${draft.index}`,
        {
          method: "PUT",
          headers: { "x-sennibook": "1", "Content-Type": "application/json" },
          body: JSON.stringify({ text, expectedText: draft.expectedText }),
        },
      );
      if (!response.ok) {
        const message = await responseError(
          response,
          "The correction could not be saved.",
        );
        throw new Error(message);
      }

      setCorrectionOverrides((current) => ({
        ...current,
        [`${source.id}:${draft.index}`]: text,
      }));
      setEditingSegment(null);
      try {
        await onChanged();
        setSaveNotice("");
      } catch {
        setSaveNotice(
          "Correction saved. The latest transcript could not be loaded yet; try refreshing this notebook.",
        );
      }
    } catch (error: unknown) {
      setEditError(
        error instanceof Error
          ? error.message
          : "The correction could not be saved.",
      );
    } finally {
      setSavingSegment(null);
    }
  };

  const transcribe = async () => {
    setActionError("");
    if (setupUnavailable) {
      onSetup();
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(source.id)}/transcribe`,
        {
          method: "POST",
          headers: { "x-sennibook": "1", "Content-Type": "application/json" },
          body: JSON.stringify({ model, language, device }),
        },
      );
      if (!response.ok)
        throw new Error(
          await responseError(response, "Local transcription could not start."),
        );
      await onChanged();
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Local transcription could not start.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!source.attachment?.mediaType.startsWith("audio/")) {
    return null;
  }

  const mediaUrl = `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(source.id)}/media${episodeId ? `?episode=${encodeURIComponent(episodeId)}` : ""}`;

  return (
    <section
      className="source-audio"
      aria-labelledby={`source-audio-title-${source.id}`}
    >
      <div className="source-audio-heading">
        <div>
          <span className="source-audio-kicker">Original recording</span>
          <h3 id={`source-audio-title-${source.id}`}>
            {source.attachment.filename}
          </h3>
          <p>
            {formatBytes(source.attachment.bytes)} · audio stays on this
            computer
          </p>
        </div>
        <span className="source-audio-local-mark">Local</span>
      </div>

      <audio
        key={source.id}
        ref={audioRef}
        className="source-audio-player"
        controls
        preload="metadata"
        onError={() =>
          setAudioError(
            "This recording could not be loaded. Check the connection and try again.",
          )
        }
        onLoadedData={() => setAudioError("")}
        onPlay={() => {
          setAudioError("");
          setPlaybackNotice("");
        }}
        src={mediaUrl}
      >
        Your browser does not support audio playback.
      </audio>
      {(audioError || playbackNotice) && (
        <div
          className="source-audio-player-recovery"
          role={audioError ? "alert" : "status"}
        >
          <span>
            <CircleAlert size={15} aria-hidden="true" />
            {audioError || playbackNotice}
          </span>
          <button type="button" onClick={retryPlayback}>
            Try Play again
          </button>
        </div>
      )}

      {isSnapshot && !source.transcript && (
        <div className="source-audio-snapshot-note" role="note">
          <span className="source-audio-kicker">Audio snapshot</span>
          <p>
            This recording was saved with the episode, but no transcript was
            saved at planning time.
          </p>
        </div>
      )}

      {!isSnapshot &&
        (needsTranscript || isTranscribing || processing?.error) && (
          <div className="source-audio-transcription" aria-live="polite">
            <div className="source-audio-transcription-topline">
              <div>
                <span className="source-audio-kicker">Local transcript</span>
                <h4>
                  {isTranscribing
                    ? "Transcribing this recording"
                    : processing?.status === "failed"
                      ? "Transcription needs another try"
                      : "Create a timestamped transcript"}
                </h4>
              </div>
              {isTranscribing && (
                <LoaderCircle
                  className="source-audio-spin"
                  size={18}
                  aria-label="Transcribing"
                />
              )}
            </div>
            <p className="source-audio-explainer">
              SenniBook uses faster-whisper on this computer. The result is
              machine generated, so check names, numbers and technical terms
              against the audio.
            </p>
            {isTranscribing && (
              <p className="source-audio-progress" role="status">
                {processing?.progress || "Working through the recording…"}
              </p>
            )}
            {processing?.status === "pending" && processing.progress && (
              <p className="source-audio-progress" role="status">
                {processing.progress}
              </p>
            )}
            {processing?.error && (
              <p className="source-audio-error" role="alert">
                <CircleAlert size={15} aria-hidden="true" />
                {processing.error}
              </p>
            )}
            {statusError && (
              <p className="source-audio-error" role="alert">
                <CircleAlert size={15} aria-hidden="true" />
                {statusError}
              </p>
            )}
            {actionError && (
              <p className="source-audio-error" role="alert">
                <CircleAlert size={15} aria-hidden="true" />
                {actionError}
              </p>
            )}
            {cudaUnavailable && (
              <p className="source-audio-warning" role="status">
                CUDA is not reported as available right now. You can choose CPU
                or try CUDA and follow the error if this machine cannot run it.
              </p>
            )}

            <details className="source-audio-settings" open={settingsOpen}>
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setSettingsOpen((open) => !open);
                }}
              >
                <Settings2 size={15} aria-hidden="true" />
                Transcription settings
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              {settingsOpen && (
                <div className="source-audio-settings-grid">
                  <label>
                    <span>Model</span>
                    <select
                      value={model}
                      onChange={(event) =>
                        setModel(event.target.value as TranscriptionModel)
                      }
                      disabled={actionDisabled}
                    >
                      {(Object.keys(modelLabels) as TranscriptionModel[]).map(
                        (option) => (
                          <option key={option} value={option}>
                            {modelLabels[option]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    <span>Language</span>
                    <select
                      value={language}
                      onChange={(event) =>
                        setLanguage(
                          event.target
                            .value as TranscriptionOptions["language"],
                        )
                      }
                      disabled={actionDisabled}
                    >
                      <option value="auto">Detect automatically</option>
                      <option value="en">English</option>
                      <option value="nl">Dutch</option>
                    </select>
                  </label>
                  <label>
                    <span>Device</span>
                    <select
                      value={device}
                      onChange={(event) =>
                        setDevice(
                          event.target.value as TranscriptionOptions["device"],
                        )
                      }
                      disabled={actionDisabled}
                    >
                      <option value="auto">Choose automatically</option>
                      <option value="cuda">NVIDIA GPU (CUDA)</option>
                      <option value="cpu">CPU</option>
                    </select>
                  </label>
                </div>
              )}
            </details>

            <div className="source-audio-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => void transcribe()}
                disabled={actionDisabled}
              >
                {submitting ? (
                  <LoaderCircle
                    className="source-audio-spin"
                    size={16}
                    aria-hidden="true"
                  />
                ) : (
                  <Play size={16} aria-hidden="true" />
                )}
                {submitting
                  ? "Starting…"
                  : setupUnavailable
                    ? "Set up local transcription"
                    : processing?.status === "failed"
                      ? "Try transcription again"
                      : "Transcribe locally"}
              </button>
              {setupUnavailable && !statusError && (
                <span className="source-audio-action-note">
                  {!status
                    ? "Local transcription setup could not be checked. Open setup to continue."
                    : !status.runtime
                      ? "A one-time local setup is needed before this recording can be transcribed."
                      : `Prepare ${model} in local setup before transcribing this recording.`}
                </span>
              )}
            </div>
            {!statusLoading && status && !status.runtime && (
              <p className="source-audio-setup-hint">
                Python and the isolated transcription runtime are not ready yet.
                Open setup for a guided preparation.
              </p>
            )}
          </div>
        )}

      {source.transcript && (
        <div
          className="source-audio-transcript"
          aria-labelledby={`transcript-title-${source.id}`}
        >
          <div className="source-audio-transcript-heading">
            <div>
              <span className="source-audio-kicker">Machine transcript</span>
              <h4 id={`transcript-title-${source.id}`}>Timestamped notes</h4>
            </div>
            <span className="source-audio-transcript-meta">
              {source.transcript.language} · {source.transcript.model}
            </span>
          </div>
          <p className="source-audio-review-note">
            Generated locally with faster-whisper. Review important passages
            against the original recording before relying on them.
          </p>
          {saveNotice && (
            <p className="source-audio-save-notice" role="status">
              {saveNotice}
            </p>
          )}
          <ol className="source-audio-segments">
            {transcriptSegments?.map((segment, index) => {
              const editedText = correctionOverrides[`${source.id}:${index}`];
              const text = editedText ?? segment.text;
              const isEdited = Boolean(
                segment.editedAt || segment.originalText || editedText,
              );
              const originalText =
                segment.originalText ?? (editedText ? segment.text : "");
              const isEditing =
                editingSegment?.sourceId === source.id &&
                editingSegment.index === index;
              return (
                <li
                  key={`${segment.start}-${segment.end}-${index}`}
                  ref={
                    index === referencedSegmentIndex
                      ? referencedSegmentRef
                      : undefined
                  }
                  className={
                    index === referencedSegmentIndex
                      ? "source-audio-referenced-segment"
                      : undefined
                  }
                  tabIndex={index === referencedSegmentIndex ? -1 : undefined}
                >
                  <button
                    type="button"
                    className="source-audio-time"
                    onClick={() => void seekTo(segment.start)}
                    aria-label={`Play from ${timestamp(segment.start)}`}
                  >
                    <Play size={13} fill="currentColor" aria-hidden="true" />
                    {timestamp(segment.start)}
                  </button>
                  <div className="source-audio-segment-body">
                    {index === referencedSegmentIndex && (
                      <span className="source-audio-reference-label">
                        Referenced passage
                      </span>
                    )}
                    {isEditing ? (
                      <form
                        className="source-audio-edit-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveCorrection();
                        }}
                      >
                        <label
                          htmlFor={`transcript-edit-${source.id}-${index}`}
                        >
                          <span className="source-audio-edit-label">
                            Correct this transcript segment
                          </span>
                          <textarea
                            id={`transcript-edit-${source.id}-${index}`}
                            value={editingSegment.text}
                            onChange={(event) =>
                              setEditingSegment((current) =>
                                current && current.index === index
                                  ? { ...current, text: event.target.value }
                                  : current,
                              )
                            }
                            minLength={1}
                            maxLength={12000}
                            rows={3}
                            disabled={correctionDisabled}
                            aria-describedby={
                              editError
                                ? `transcript-edit-error-${source.id}-${index}`
                                : undefined
                            }
                          />
                        </label>
                        {editError && (
                          <p
                            className="source-audio-edit-error"
                            id={`transcript-edit-error-${source.id}-${index}`}
                            role="alert"
                          >
                            <CircleAlert size={14} aria-hidden="true" />
                            {editError}
                          </p>
                        )}
                        <div className="source-audio-edit-actions">
                          <button
                            type="submit"
                            className="button primary"
                            disabled={correctionDisabled}
                          >
                            {savingSegment === index && (
                              <LoaderCircle
                                className="source-audio-spin"
                                size={15}
                                aria-hidden="true"
                              />
                            )}
                            {savingSegment === index
                              ? "Saving…"
                              : "Save correction"}
                          </button>
                          <button
                            type="button"
                            className="button quiet"
                            onClick={() => {
                              setEditingSegment(null);
                              setEditError("");
                            }}
                            disabled={correctionDisabled}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="source-audio-segment-topline">
                          <p>{text}</p>
                          {!isSnapshot && (
                            <button
                              type="button"
                              className="source-audio-edit-button"
                              aria-label={`Correct transcript at ${timestamp(segment.start)}`}
                              title="Correct transcript"
                              onClick={() => beginEdit(index, text)}
                              disabled={correctionDisabled}
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {isEdited && originalText && (
                          <details className="source-audio-original">
                            <summary>Show original machine text</summary>
                            <p>{originalText}</p>
                          </details>
                        )}
                        {isEdited && (
                          <span className="source-audio-corrected">
                            Corrected
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
