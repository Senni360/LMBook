import { InkButton } from "./InkControl";
import { MotionList } from "./Motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, History, LoaderCircle } from "lucide-react";
import "./activity-history.css";

type ActivityOperation = "plan" | "script" | "audio" | "preview";
type ActivityState =
  "running" | "completed" | "cancelled" | "interrupted" | "failed";

type ActivityRow = {
  id: string;
  notebookId: string;
  episodeId: string;
  operation: ActivityOperation;
  state: ActivityState;
  progress: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
};

export type ActivityHistoryProps = {
  notebookId: string;
  refreshKey?: string | number;
};

const operationLabels: Record<ActivityOperation, string> = {
  plan: "Episode planning",
  script: "Script generation",
  audio: "Audio generation",
  preview: "Voice preview",
};

const stateLabels: Record<ActivityState, string> = {
  running: "Running",
  completed: "Completed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
  failed: "Failed",
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ActivityHistory({
  notebookId,
  refreshKey,
}: ActivityHistoryProps) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const loadedToken = useRef<string | null>(null);
  const openRef = useRef(false);
  const refreshToken =
    refreshKey === undefined ? "initial" : String(refreshKey);

  const load = useCallback(
    async (force = false) => {
      if (
        (request.current && !force) ||
        (!force && loadedToken.current === refreshToken)
      )
        return;
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/notebooks/${encodeURIComponent(notebookId)}/activity`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as unknown;
        if (controller.signal.aborted) return;
        if (!response.ok)
          throw new Error(
            payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : "Generation history could not be loaded.",
          );
        if (!Array.isArray(payload))
          throw new Error("Unexpected history response.");
        setRows(payload as ActivityRow[]);
        loadedToken.current = refreshToken;
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Generation history is unavailable right now.",
        );
      } finally {
        if (request.current === controller) {
          request.current = null;
          setLoading(false);
        }
      }
    },
    [notebookId, refreshToken],
  );

  useEffect(() => {
    loadedToken.current = null;
    if (openRef.current) void load(true);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [load]);

  return (
    <details
      className="activity-history"
      onToggle={(event) => {
        openRef.current = event.currentTarget.open;
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>
        <span className="activity-history-summary">
          <History size={16} aria-hidden="true" />
          <span>Generation history</span>
        </span>
        <span className="activity-history-count">
          {rows.length ? `${rows.length} recent` : "Recent jobs"}
        </span>
      </summary>

      <div className="activity-history-body" aria-live="polite">
        {loading && (
          <p className="activity-history-message">
            <LoaderCircle
              className="activity-history-spin"
              size={15}
              aria-hidden="true"
            />
            Loading recent jobs…
          </p>
        )}
        {error && (
          <div className="activity-history-error" role="alert">
            <p>
              <CircleAlert size={15} aria-hidden="true" />
              {error}
            </p>
            <InkButton type="button" onClick={() => void load(true)}>
              Try again
            </InkButton>
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <p className="activity-history-message">No generation jobs yet.</p>
        )}
        {!error && rows.length > 0 && (
          <MotionList
            as="ol"
            itemsKey={rows.map((row) => row.id).join(":")}
            className="activity-history-list"
          >
            {rows.map((activity) => (
              <li key={activity.id} className="activity-history-row">
                <span
                  className={`activity-history-state activity-history-state-${activity.state}`}
                  aria-hidden="true"
                />
                <div className="activity-history-main">
                  <div className="activity-history-title-line">
                    <strong>{operationLabels[activity.operation]}</strong>
                    <span className="activity-history-state-label">
                      {stateLabels[activity.state]}
                    </span>
                  </div>
                  <p>
                    {activity.error ||
                      activity.progress ||
                      "No progress detail recorded."}
                  </p>
                </div>
                <time dateTime={activity.updatedAt}>
                  {formatTime(activity.updatedAt)}
                </time>
              </li>
            ))}
          </MotionList>
        )}
      </div>
    </details>
  );
}
