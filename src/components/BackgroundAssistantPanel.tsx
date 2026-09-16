import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  ChevronDown,
  Link2,
  Pause,
  Play,
  Settings2,
  X,
} from "lucide-react";
import { aiApi } from "../ai-api";
import { InkButton, InkInput, InkSelect } from "./InkControl";
import type { VaultIndex } from "../../shared/vault";
import type {
  BackgroundAssistantSettings,
  BackgroundAssistantProposal,
} from "../../shared/background-assistant";
import { ResizableCard } from "./ResizableCard";
import "./background-assistant.css";

type Mode = "ask" | "obvious" | "full";
type AssistantSettings = BackgroundAssistantSettings;
type Proposal = BackgroundAssistantProposal & { addition?: string };
type AssistantState = {
  settings: AssistantSettings;
  status: { state: string; message: string; lastRunAt?: string | null };
  proposals: Proposal[];
  activity: { id: string; createdAt: string; message: string }[];
};
const modes: Record<Mode, string> = {
  ask: "Ask every time",
  obvious: "Automatic for straightforward links",
  full: "Full control",
};
const basename = (value: string) =>
  value.split("/").at(-1)?.replace(/\.md$/i, "") || value;

export function BackgroundAssistantPanel({
  notebookId,
  vaultId,
  onOpenNote,
  onChanged,
  onReveal,
}: {
  notebookId: string;
  vaultId: string;
  onOpenNote: (path: string) => void;
  onChanged: () => Promise<void>;
  onReveal: () => void;
}) {
  const [state, setState] = useState<AssistantState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [draft, setDraft] = useState<AssistantSettings | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 12_000);
    return () => clearTimeout(timer);
  }, [toast]);
  const root = useRef<HTMLElement>(null);
  const previous = useRef<string | null>(null);
  const readSequence = useRef(0);
  const sessionSeen = useRef(new Set<string>());
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const base = `/notebooks/${notebookId}/assistant`;
  const read = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++readSequence.current;
      const next = await aiApi<AssistantState>(base, "GET", undefined, signal);
      if (signal?.aborted || sequence !== readSequence.current) return;
      setState(next);
      const additions = next.proposals.filter(
        (p) => p.status === "pending" || p.status === "applied",
      );
      const seenKey = `lmbook:assistant-seen:${notebookId}`;
      let seen: string[] = [];
      try {
        seen = JSON.parse(localStorage.getItem(seenKey) || "[]");
        if (!Array.isArray(seen)) seen = [];
      } catch {
        /* In-memory notification state still works. */
      }
      const unseen = additions.filter(
        (p) =>
          !seen.includes(`${p.id}:${p.status}`) &&
          !sessionSeen.current.has(`${p.id}:${p.status}`),
      );
      if (unseen.length && next.settings.notifications) {
        unseen.forEach((p) => sessionSeen.current.add(`${p.id}:${p.status}`));
        const pending = unseen.filter((p) => p.status === "pending").length;
        setToast(
          pending
            ? `${pending} note connection${pending === 1 ? " is" : "s are"} ready to review.`
            : `${unseen.length} note connection${unseen.length === 1 ? " was" : "s were"} added. Undo is available.`,
        );
        try {
          localStorage.setItem(
            seenKey,
            JSON.stringify(
              [...seen, ...unseen.map((p) => `${p.id}:${p.status}`)].slice(
                -1000,
              ),
            ),
          );
        } catch {
          /* No storage is not a request failure. */
        }
      }
      const applied = next.proposals
        .filter((p) => p.status === "applied" || p.status === "undone")
        .map((p) => `${p.id}:${p.status}`)
        .join("|");
      if (previous.current !== null && previous.current !== applied)
        void changed.current();
      previous.current = applied;
    },
    [base, notebookId],
  );
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        await read(controller.signal);
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      }
      if (!controller.signal.aborted)
        timer = setTimeout(poll, document.hidden ? 12000 : 4000);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [read]);
  useEffect(() => {
    if (!configure) return;
    const controller = new AbortController();
    setFilesLoading(true);
    void aiApi<VaultIndex>(
      `/vaults/${vaultId}/files`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setFiles(result.files.map((file) => file.path));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFilesLoading(false);
      });
    return () => controller.abort();
  }, [configure, vaultId]);
  const act = async (
    name: string,
    url: string,
    method = "POST",
    body?: unknown,
  ) => {
    setBusy(name);
    setError("");
    try {
      await aiApi(url, method, body);
      await read();
      return true;
    } catch (e) {
      setError((e as Error).message);
      await read().catch(() => {});
      return false;
    } finally {
      setBusy("");
    }
  };
  const setup = () => {
    if (state)
      setDraft({
        ...state.settings,
        selectedPaths: [...state.settings.selectedPaths],
      });
    setConfigure(true);
    setExpanded(true);
  };
  const pending = state?.proposals.filter((p) => p.status === "pending") || [];
  const history = state?.proposals.filter((p) => p.status !== "pending") || [];
  const running =
    state?.status.state === "running" || state?.status.state === "queued";
  const showPanel = () => {
    onReveal();
    setExpanded(true);
    setToast("");
    requestAnimationFrame(() => {
      root.current?.scrollIntoView({ block: "nearest" });
      root.current?.focus({ preventScroll: true });
    });
  };
  return (
    <>
      <section
        className="background-assistant"
        ref={root}
        tabIndex={-1}
        aria-label="Background assistant"
      >
        <header className="assistant-heading">
          <InkButton
            className="button quiet assistant-expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <Link2 size={16} />
            <strong>Note connections</strong>
            {pending.length > 0 && (
              <span className="assistant-count">{pending.length}</span>
            )}
            <ChevronDown size={14} className={expanded ? "is-open" : ""} />
          </InkButton>
          <InkButton
            className="icon-button"
            title="Assistant settings"
            aria-label="Assistant settings"
            disabled={!state}
            onClick={setup}
          >
            <Settings2 size={16} />
          </InkButton>
        </header>
        <div className="assistant-status" role="status">
          {!state
            ? "Loading assistant…"
            : !state.settings.enabled
              ? "Paused · choose the notes it can work with"
              : running
                ? state.status.message || "Looking for useful connections…"
                : state.status.message ||
                  `${modes[state.settings.mode]} · watching selected notes`}
        </div>
        {error && (
          <div className="assistant-error" role="alert">
            {error}
            <InkButton
              className="button small"
              onClick={() => {
                setError("");
                void read().catch((e) => setError(e.message));
              }}
            >
              Retry
            </InkButton>
          </div>
        )}
        {!state?.settings.selectedPaths.length && state && !configure && (
          <div className="assistant-intro">
            <p>
              Find useful connections between your notes, with the passages that
              explain why.
            </p>
            <InkButton className="button small" onClick={setup}>
              Set up assistant
            </InkButton>
          </div>
        )}
        {expanded && state && (
          <ResizableCard
            storageKey={`lmbook:card-height:${notebookId}:assistant`}
            label="assistant panel"
            defaultHeight={360}
            minHeight={160}
            maxHeight={900}
            className="assistant-height-card"
            contentClassName="assistant-content"
          >
            {configure && draft ? (
              <form
                className="assistant-settings"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act("settings", base, "PATCH", draft))
                    setConfigure(false);
                }}
              >
                <label className="assistant-check">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) =>
                      setDraft({ ...draft, enabled: e.target.checked })
                    }
                  />
                  Watch these notes in the background
                </label>
                <p className="fine-print">
                  Selected note text goes to Luna through your Codex connection.
                  It runs while LMBook is open and uses your subscription
                  allowance.
                </p>
                <label>
                  Agent control
                  <InkSelect
                    value={draft.mode}
                    onChange={(e) =>
                      setDraft({ ...draft, mode: e.target.value as Mode })
                    }
                  >
                    {Object.entries(modes).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </InkSelect>
                </label>
                <p className="fine-print">
                  {draft.mode === "full"
                    ? "Adds supported links to selected notes without asking. Every addition is recorded and can be undone."
                    : draft.mode === "obvious"
                      ? "Automatically links an explicit, unambiguous note mention. Other relationships wait for your review."
                      : "Prepares links in this panel. Nothing is added to a note until you accept it."}
                </p>
                <fieldset>
                  <legend>Notes the assistant can read and link</legend>
                  <p className="fine-print">
                    Reviews the first 6,000 characters of each selected note, in
                    small batches while LMBook is open. Select up to 150 notes;
                    longer passages are not reviewed yet.
                  </p>
                  <InkInput
                    aria-label="Filter assistant notes"
                    placeholder="Find a note…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <div className="assistant-actions">
                    <InkButton
                      type="button"
                      className="button small quiet"
                      disabled={filesLoading}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          selectedPaths: files.slice(0, 150),
                        })
                      }
                    >
                      Select all{files.length > 150 ? " (first 150)" : ""}
                    </InkButton>
                    <InkButton
                      type="button"
                      className="button small quiet"
                      onClick={() => setDraft({ ...draft, selectedPaths: [] })}
                    >
                      Deselect all
                    </InkButton>
                    <span>{draft.selectedPaths.length} selected</span>
                  </div>
                  <div className="assistant-scope">
                    {filesLoading ? (
                      <p role="status">Reading note list…</p>
                    ) : files.length === 0 ? (
                      <p>Add or save a Markdown note to start.</p>
                    ) : (
                      files
                        .filter((file) =>
                          file.toLowerCase().includes(filter.toLowerCase()),
                        )
                        .map((file) => (
                          <label className="assistant-check" key={file}>
                            <input
                              type="checkbox"
                              checked={draft.selectedPaths.includes(file)}
                              disabled={
                                !draft.selectedPaths.includes(file) &&
                                draft.selectedPaths.length >= 150
                              }
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  selectedPaths: e.target.checked
                                    ? [...draft.selectedPaths, file]
                                    : draft.selectedPaths.filter(
                                        (path) => path !== file,
                                      ),
                                })
                              }
                            />
                            <span>{file}</span>
                          </label>
                        ))
                    )}
                  </div>
                </fieldset>
                <label className="assistant-check">
                  <input
                    type="checkbox"
                    checked={draft.notifications}
                    onChange={(e) =>
                      setDraft({ ...draft, notifications: e.target.checked })
                    }
                  />
                  Show a notification when connections are ready
                </label>
                <div className="assistant-actions">
                  <InkButton
                    className="button primary small"
                    disabled={
                      !!busy ||
                      (draft.enabled && draft.selectedPaths.length < 2)
                    }
                  >
                    Save assistant settings
                  </InkButton>
                  <InkButton
                    type="button"
                    className="button small quiet"
                    disabled={!!busy}
                    onClick={() => setConfigure(false)}
                  >
                    Cancel
                  </InkButton>
                </div>
                {draft.enabled && draft.selectedPaths.length < 2 && (
                  <p className="fine-print">
                    Choose at least two notes to find connections.
                  </p>
                )}
              </form>
            ) : (
              <>
                {!!state.settings.selectedPaths.length && (
                  <div className="assistant-actions">
                    <InkButton
                      className="button small"
                      disabled={!!busy || running || !state.settings.enabled}
                      onClick={() => void act("run", `${base}/run`)}
                    >
                      Check now
                    </InkButton>
                    <InkButton
                      className="button small quiet"
                      disabled={!!busy}
                      onClick={() =>
                        void act("pause", base, "PATCH", {
                          enabled: !state.settings.enabled,
                        })
                      }
                    >
                      {state.settings.enabled ? (
                        <Pause size={13} />
                      ) : (
                        <Play size={13} />
                      )}
                      {state.settings.enabled ? "Pause" : "Resume"}
                    </InkButton>
                    <span>
                      {state.settings.selectedPaths.length} notes ·{" "}
                      {modes[state.settings.mode]}
                    </span>
                  </div>
                )}
                {pending.length === 0 && state.settings.enabled && !running && (
                  <p className="assistant-empty">
                    No connections waiting for review. New suggestions will
                    appear here when the selected notes change.
                  </p>
                )}
                <div className="assistant-proposals">
                  {pending.map((proposal) => (
                    <article className="assistant-proposal" key={proposal.id}>
                      <p className="assistant-pair">
                        <InkButton
                          className="text-action"
                          onClick={() => onOpenNote(proposal.sourcePath)}
                        >
                          {basename(proposal.sourcePath)}
                        </InkButton>
                        <span aria-label="links to">→</span>
                        <InkButton
                          className="text-action"
                          onClick={() => onOpenNote(proposal.targetPath)}
                        >
                          {basename(proposal.targetPath)}
                        </InkButton>
                      </p>
                      <p>{proposal.explanation}</p>
                      {proposal.jevCheck && (
                        <p className="fine-print">
                          {proposal.jevCheck.message}
                          {proposal.jevCheck.confidence !== null &&
                            ` Confidence estimate: ${Math.round(proposal.jevCheck.confidence * 100)}%.`}{" "}
                          This is an advisory model check.
                        </p>
                      )}
                      <details>
                        <summary>Evidence and exact addition</summary>
                        <h4>{basename(proposal.sourcePath)}</h4>
                        <blockquote>{proposal.sourceQuote}</blockquote>
                        <h4>{basename(proposal.targetPath)}</h4>
                        <blockquote>{proposal.targetQuote}</blockquote>
                        <h4>Append to {basename(proposal.sourcePath)}</h4>
                        <pre>{proposal.addition}</pre>
                      </details>
                      <div className="assistant-actions">
                        <InkButton
                          className="button small"
                          disabled={!!busy}
                          onClick={() =>
                            void act(
                              proposal.id,
                              `${base}/proposals/${proposal.id}/apply`,
                              "POST",
                              { approved: true },
                            )
                          }
                        >
                          Add link
                        </InkButton>
                        <InkButton
                          className="button small quiet"
                          disabled={!!busy}
                          onClick={() =>
                            void act(
                              proposal.id,
                              `${base}/proposals/${proposal.id}/dismiss`,
                            )
                          }
                        >
                          Dismiss
                        </InkButton>
                      </div>
                    </article>
                  ))}
                </div>
                {(history.length > 0 || state.activity.length > 0) && (
                  <details className="assistant-history">
                    <summary>Activity & undo</summary>
                    {history.slice(0, 30).map((proposal) => (
                      <div className="assistant-history-item" key={proposal.id}>
                        <span>
                          {basename(proposal.sourcePath)} →{" "}
                          {basename(proposal.targetPath)}
                          <small>
                            {proposal.status === "applied"
                              ? "Added to note"
                              : proposal.status === "undone"
                                ? "Undone"
                                : proposal.status === "failed"
                                  ? "Notes changed · needs a fresh check"
                                  : "Dismissed"}
                          </small>
                        </span>
                        {proposal.status === "applied" && (
                          <InkButton
                            className="button small quiet"
                            disabled={!!busy}
                            onClick={() =>
                              void act(
                                proposal.id,
                                `${base}/proposals/${proposal.id}/undo`,
                              )
                            }
                          >
                            Undo
                          </InkButton>
                        )}
                      </div>
                    ))}
                    {state.activity.slice(0, 12).map((item) => (
                      <p key={item.id}>
                        <time>
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>{" "}
                        {item.message}
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
          </ResizableCard>
        )}
      </section>
      {toast &&
        createPortal(
          <aside className="assistant-toast" role="status" aria-live="polite">
            <Bell size={18} />
            <div>
              <strong>Note connections</strong>
              <p>{toast}</p>
              <InkButton className="button small" onClick={showPanel}>
                Review connections
              </InkButton>
            </div>
            <InkButton
              className="icon-button"
              aria-label="Dismiss assistant notification"
              onClick={() => setToast("")}
            >
              <X size={16} />
            </InkButton>
          </aside>,
          document.body,
        )}
    </>
  );
}
