import { confirmInk } from "./InkDialog";
import { InkButton } from "./InkControl";
import { MotionList } from "./Motion";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import "./notebook-trash.css";

type TrashEntry = {
  id: string;
  title: string;
  deletedAt: string;
  state: "trashed" | "purging";
  error?: string;
  sourceCount: number;
  episodeCount: number;
};

async function request<T>(
  url: string,
  method = "GET",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    signal,
    headers: method === "GET" ? {} : { "x-sennibook": "1" },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Trash could not be updated. Try again.");
  return result;
}

function deletedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function NotebookTrash({
  disabled,
  refreshKey,
  onRestored,
}: {
  disabled: boolean;
  refreshKey: number;
  onRestored: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TrashEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState("");
  const [revision, setRevision] = useState(0);
  const actionRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void request<TrashEntry[]>("/api/trash", "GET", controller.signal)
      .then((result) => {
        if (!Array.isArray(result))
          throw new Error(
            "Trash returned an unexpected response. Refresh to try again.",
          );
        if (!controller.signal.aborted) setEntries(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setLoadError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, refreshKey, revision]);

  const act = async (entry: TrashEntry, permanent: boolean) => {
    if (actionRef.current || disabled) return;
    if (
      permanent &&
      !(await confirmInk(
        `Permanently delete “${entry.title}”? Its notes, episodes and files cannot be restored from Trash. Files used by other notebooks are kept.`,
        "Permanently delete notebook?",
        "Delete permanently",
      ))
    )
      return;
    actionRef.current = true;
    setPending(entry.id);
    setError("");
    setMessage(
      permanent ? "Permanently deleting notebook…" : "Restoring notebook…",
    );
    try {
      const result = await request<{ episodeIds?: string[] }>(
        `/api/trash/${encodeURIComponent(entry.id)}${permanent ? "" : "/restore"}`,
        permanent ? "DELETE" : "POST",
      );
      if (permanent) {
        try {
          const episodePrefixes = (result.episodeIds || []).map(
            (id) => `sennibook:resume:${encodeURIComponent(id)}:`,
          );
          for (const key of Object.keys(localStorage)) {
            if (
              key.startsWith(`sennibook:draft:v1:${entry.id}:`) ||
              key === `sennibook:studio:${entry.id}` ||
              episodePrefixes.some((prefix) => key.startsWith(prefix))
            )
              localStorage.removeItem(key);
          }
          if (localStorage.getItem("sennibook:last") === entry.id)
            localStorage.removeItem("sennibook:last");
        } catch {
          setError(
            "The notebook was deleted, but saved drafts on this device could not be cleared.",
          );
        }
      }
      setEntries(
        (previous) => previous?.filter((item) => item.id !== entry.id) || [],
      );
      setMessage(
        permanent
          ? "Notebook permanently deleted."
          : "Notebook restored to your library.",
      );
      if (!permanent) {
        try {
          await onRestored(entry.id);
        } catch {
          setError(
            "The notebook was restored, but the library list could not refresh. Reload the app to update it.",
          );
        }
      }
    } catch (reason) {
      setMessage("");
      setError(
        reason instanceof Error
          ? reason.message
          : "This action could not finish. Try again.",
      );
    } finally {
      actionRef.current = false;
      setPending("");
      setRevision((value) => value + 1);
    }
  };

  return (
    <details
      className="notebook-trash"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Trash2 size={17} aria-hidden="true" /> Trash
        {entries ? ` · ${entries.length}` : ""}
      </summary>
      <p>
        Deleted notebooks stay here until you restore or permanently delete
        them. Their files still use space on this computer.
      </p>
      {loading && (
        <p role="status">
          <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading
          Trash…
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {(error || loadError) && (
        <div className="trash-error" role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          <span>{error || loadError}</span>
        </div>
      )}
      {loadError && !pending && (
        <InkButton
          className="button quiet"
          onClick={() => setRevision((value) => value + 1)}
        >
          Refresh Trash
        </InkButton>
      )}
      {!loading && entries?.length === 0 && <p>Trash is empty.</p>}
      <MotionList itemsKey={entries?.map((entry) => entry.id).join(":") || ""}>
        {entries?.map((entry) => (
          <div className="trash-entry" key={entry.id}>
            <div className="trash-entry-details">
              <h3>{entry.title}</h3>
              <p>
                {deletedDate(entry.deletedAt)} · {entry.sourceCount} source
                {entry.sourceCount === 1 ? "" : "s"} · {entry.episodeCount}{" "}
                episode{entry.episodeCount === 1 ? "" : "s"}
              </p>
              {entry.state === "purging" && (
                <p className="trash-error">
                  Permanent deletion did not finish. Retry to remove the
                  remaining files; this notebook can no longer be restored.
                </p>
              )}
              {entry.error && <p className="trash-error">{entry.error}</p>}
            </div>
            <div className="trash-entry-actions">
              {entry.state === "trashed" && (
                <InkButton
                  className="button"
                  disabled={disabled || !!pending}
                  onClick={() => void act(entry, false)}
                  aria-label={`Restore ${entry.title}`}
                >
                  <RotateCcw size={16} aria-hidden="true" /> Restore
                </InkButton>
              )}
              <InkButton
                className="button quiet trash-purge"
                disabled={disabled || !!pending}
                onClick={() => void act(entry, true)}
                aria-label={`${entry.state === "purging" ? "Retry permanent deletion of" : "Permanently delete"} ${entry.title}`}
              >
                <Trash2 size={16} aria-hidden="true" />
                {entry.state === "purging"
                  ? "Retry permanent deletion"
                  : "Delete permanently"}
              </InkButton>
            </div>
          </div>
        ))}
      </MotionList>
    </details>
  );
}
