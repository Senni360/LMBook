import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileWarning,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { Notebook, Source } from "../../../shared/model";
import type { VaultNote } from "../../../shared/vault";
import type {
  VaultSourceChange,
  VaultSourceChanges,
  VaultSourceRefreshResult,
} from "../../../shared/vault-learning";
import { InkButton, InkInput } from "../InkControl";
import "./vault-source-review.css";

export type VaultSourceReviewProps = {
  notebook: Notebook;
  onUpdated: () => Promise<void>;
  onOpenVaultNote?: (vaultId: string, path: string) => void;
};

type VaultGroup = {
  vaultId: string;
  vaultName: string;
  sources: Source[];
};

type VaultReviewError = {
  message: string;
  unavailable: boolean;
};

type VaultReview = {
  result?: VaultSourceChanges;
  error?: VaultReviewError;
};

type Comparison = {
  status: "loading" | "ready" | "error";
  live?: VaultNote;
  fullText: boolean;
  error?: string;
};

type ReviewState = "idle" | "checking" | "ready" | "refreshing";

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-sennibook": "1",
      ...(init.headers || {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok)
    throw Object.assign(
      new Error(payload?.error || "The vault could not be checked."),
      { status: response.status },
    );
  return payload as T;
}

function shortRevision(revision: string | null) {
  return revision ? `${revision.slice(0, 10)}…` : "unavailable";
}

function snapshotCount(change: VaultSourceChange) {
  return (
    change.references.episodeSnapshots +
    change.references.flashcardSnapshots +
    (change.references.chatSnapshots || 0)
  );
}

function unavailableMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "The vault is unavailable.";
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  return {
    message,
    unavailable:
      status === 404 ||
      /unavailable|disconnected|reconnect|not found|could not be read/i.test(
        message,
      ),
  } satisfies VaultReviewError;
}

function statusLabel(status: VaultSourceChange["status"]) {
  if (status === "unchanged") return "Current";
  if (status === "changed") return "Changed";
  return "Missing";
}

function statusIcon(status: VaultSourceChange["status"]) {
  if (status === "unchanged")
    return <CheckCircle2 size={15} aria-hidden="true" />;
  if (status === "changed") return <RotateCcw size={15} aria-hidden="true" />;
  return <FileWarning size={15} aria-hidden="true" />;
}

function statusClass(status: VaultSourceChange["status"]) {
  return `vault-source-review-status vault-source-review-status--${status}`;
}

function comparisonExcerpt(before: string, after: string, fullText: boolean) {
  if (fullText || before === after) return { before, after, omitted: false };
  let prefix = 0;
  const shared = Math.min(before.length, after.length);
  while (prefix < shared && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix += 1;
  const context = 360;
  const beforeStart = Math.max(0, prefix - context);
  const afterStart = Math.max(0, prefix - context);
  const beforeEnd = Math.min(before.length - suffix + context, before.length);
  const afterEnd = Math.min(after.length - suffix + context, after.length);
  const marker = "\n\n[… text omitted …]\n\n";
  return {
    before: `${beforeStart ? marker : ""}${before.slice(beforeStart, beforeEnd)}${beforeEnd < before.length ? marker : ""}`,
    after: `${afterStart ? marker : ""}${after.slice(afterStart, afterEnd)}${afterEnd < after.length ? marker : ""}`,
    omitted:
      beforeStart > 0 ||
      afterStart > 0 ||
      beforeEnd < before.length ||
      afterEnd < after.length,
  };
}

export function VaultSourceReview({
  notebook,
  onUpdated,
  onOpenVaultNote,
}: VaultSourceReviewProps) {
  const groups = useMemo<VaultGroup[]>(() => {
    const byVault = new Map<string, VaultGroup>();
    notebook.sources.forEach((source) => {
      if (!source.vault) return;
      const group = byVault.get(source.vault.vaultId) || {
        vaultId: source.vault.vaultId,
        vaultName: source.vault.vaultName,
        sources: [],
      };
      group.sources.push(source);
      byVault.set(source.vault.vaultId, group);
    });
    return [...byVault.values()];
  }, [notebook.sources]);
  const [reviews, setReviews] = useState<Record<string, VaultReview>>({});
  const [openVaults, setOpenVaults] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comparisons, setComparisons] = useState<Record<string, Comparison>>(
    {},
  );
  const [state, setState] = useState<ReviewState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const reviewSerial = useRef(0);
  const currentNotebook = useRef(notebook);
  const controllers = useRef<AbortController[]>([]);
  const refreshAcknowledgement = useRef<{
    notebookId: string;
    message: string;
  } | null>(null);

  currentNotebook.current = notebook;

  useEffect(() => {
    const acknowledgement = refreshAcknowledgement.current;
    refreshAcknowledgement.current = null;
    reviewSerial.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current = [];
    setReviews({});
    setOpenVaults(new Set());
    setSelected(new Set());
    setComparisons({});
    setState("idle");
    setError("");
    setNotice(
      acknowledgement?.notebookId === notebook.id
        ? acknowledgement.message
        : "",
    );
  }, [
    notebook.id,
    notebook.updatedAt,
    groups
      .map((group) =>
        group.sources
          .map((source) => `${source.id}:${source.vault?.revision}`)
          .join(","),
      )
      .join("|"),
  ]);

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current = [];
    },
    [],
  );

  const reviewed =
    Object.keys(reviews).length === groups.length && groups.length > 0;
  const changedSources = useMemo(
    () =>
      groups.flatMap(
        (group) =>
          reviews[group.vaultId]?.result?.changes.filter(
            (change) => change.status === "changed",
          ) || [],
      ),
    [groups, reviews],
  );
  const selectedChangedCount = changedSources.filter((change) =>
    selected.has(change.sourceId),
  ).length;
  const selectedIds = useMemo(() => [...selected], [selected]);

  function invalidateReview(message: string) {
    reviewSerial.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current = [];
    setReviews({});
    setOpenVaults(new Set());
    setSelected(new Set());
    setComparisons({});
    setState("idle");
    setNotice("");
    setError(message);
  }

  function isCurrent(ticket: number) {
    return (
      ticket === reviewSerial.current &&
      currentNotebook.current.id === notebook.id
    );
  }

  async function inspect() {
    if (!groups.length || state === "checking" || state === "refreshing")
      return;
    const ticket = ++reviewSerial.current;
    controllers.current.forEach((controller) => controller.abort());
    const requests = groups.map((group) => {
      const controller = new AbortController();
      controllers.current.push(controller);
      return request<VaultSourceChanges>(
        `/vaults/${encodeURIComponent(group.vaultId)}/learning/changes?notebookId=${encodeURIComponent(notebook.id)}`,
        { signal: controller.signal },
      )
        .then((result) => ({ vaultId: group.vaultId, result }))
        .catch((reason) => ({
          vaultId: group.vaultId,
          error: unavailableMessage(reason),
        }));
    });
    setState("checking");
    setError("");
    setNotice("");
    setSelected(new Set());
    setComparisons({});
    const results = await Promise.all(requests);
    if (!isCurrent(ticket)) return;
    setReviews(
      Object.fromEntries(
        results.map((result) =>
          "result" in result
            ? [result.vaultId, { result: result.result }]
            : [result.vaultId, { error: result.error }],
        ),
      ),
    );
    setOpenVaults(new Set(results.map((result) => result.vaultId)));
    setState("ready");
    if (
      results.some((result) => "error" in result && !result.error.unavailable)
    )
      setError(
        "Some vault changes could not be checked. Review each vault below.",
      );
    controllers.current = [];
  }

  function toggleSelected(sourceId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
    setError("");
    setNotice("");
  }

  async function compareChange(
    vaultId: string,
    change: VaultSourceChange,
    source: Source | undefined,
  ) {
    if (!source || change.status !== "changed" || !change.currentRevision)
      return;
    const current = comparisons[change.sourceId];
    if (current?.status === "ready") {
      setComparisons((previous) => ({
        ...previous,
        [change.sourceId]: {
          ...current,
          fullText: !current.fullText,
        },
      }));
      return;
    }
    const ticket = reviewSerial.current;
    setComparisons((previous) => ({
      ...previous,
      [change.sourceId]: { status: "loading", fullText: false },
    }));
    try {
      const note = await request<VaultNote>(
        `/vaults/${encodeURIComponent(vaultId)}/note?path=${encodeURIComponent(change.path)}`,
      );
      if (!isCurrent(ticket)) return;
      if (note.revision !== change.currentRevision) {
        invalidateReview(
          `${change.path} changed again while it was being compared. Check vault changes again before selecting or refreshing it.`,
        );
        return;
      }
      setComparisons((previous) => ({
        ...previous,
        [change.sourceId]: {
          status: "ready",
          live: note,
          fullText: false,
        },
      }));
    } catch (reason) {
      if (!isCurrent(ticket)) return;
      setComparisons((previous) => ({
        ...previous,
        [change.sourceId]: {
          status: "error",
          fullText: false,
          error:
            reason instanceof Error
              ? reason.message
              : "The live note could not be loaded for comparison.",
        },
      }));
    }
  }

  async function refreshSelected() {
    if (!selectedIds.length || state === "refreshing" || !reviewed) return;
    const ticket = ++reviewSerial.current;
    setState("refreshing");
    setError("");
    setNotice("");
    try {
      const vaultIds = new Set(
        groups
          .filter((group) =>
            group.sources.some((source) => selected.has(source.id)),
          )
          .map((group) => group.vaultId),
      );
      const refreshed: Array<{
        vaultId: string;
        result: VaultSourceRefreshResult;
      }> = [];
      for (const vaultId of vaultIds) {
        const sourceIds = selectedIds.filter((sourceId) =>
          groups
            .find((group) => group.vaultId === vaultId)
            ?.sources.some((source) => source.id === sourceId),
        );
        if (!sourceIds.length) continue;
        const revisions = Object.fromEntries(
          sourceIds.map((sourceId) => {
            const change = reviews[vaultId]?.result?.changes.find(
              (candidate) => candidate.sourceId === sourceId,
            );
            return [sourceId, change?.currentRevision || ""];
          }),
        );
        const result = await request<VaultSourceRefreshResult>(
          `/vaults/${encodeURIComponent(vaultId)}/learning/refresh`,
          {
            method: "POST",
            body: JSON.stringify({
              notebookId: notebook.id,
              sourceIds,
              revisions,
            }),
          },
        );
        refreshed.push({ vaultId, result });
      }
      if (!isCurrent(ticket)) return;
      setReviews((current) => {
        const next = { ...current };
        refreshed.forEach(({ vaultId, result }) => {
          const previous = next[vaultId]?.result;
          if (!previous) return;
          next[vaultId] = {
            result: {
              ...previous,
              changes: previous.changes.map(
                (change) =>
                  result.changes.find(
                    (item) => item.sourceId === change.sourceId,
                  ) || change,
              ),
              counts: {
                unchanged: previous.changes.filter(
                  (change) =>
                    (
                      result.changes.find(
                        (item) => item.sourceId === change.sourceId,
                      ) || change
                    ).status === "unchanged",
                ).length,
                changed: previous.changes.filter(
                  (change) =>
                    (
                      result.changes.find(
                        (item) => item.sourceId === change.sourceId,
                      ) || change
                    ).status === "changed",
                ).length,
                missing: previous.changes.filter(
                  (change) =>
                    (
                      result.changes.find(
                        (item) => item.sourceId === change.sourceId,
                      ) || change
                    ).status === "missing",
                ).length,
              },
            },
          };
        });
        return next;
      });
      setSelected(new Set());
      setState("ready");
      const refreshedCount = refreshed.reduce(
        (sum, item) => sum + item.result.refreshed,
        0,
      );
      const acknowledgement = `${refreshedCount} source${refreshedCount === 1 ? "" : "s"} refreshed. Saved lessons, flashcards and cited chat answers keep their earlier source text.`;
      refreshAcknowledgement.current = {
        notebookId: notebook.id,
        message: acknowledgement,
      };
      setNotice(acknowledgement);
      try {
        await onUpdated();
        if (isCurrent(ticket)) setNotice(acknowledgement);
      } catch {
        refreshAcknowledgement.current = null;
        if (isCurrent(ticket)) {
          setNotice("");
          setError(
            "The sources refreshed, but the notebook view could not be reloaded. Check changes again when ready.",
          );
        }
      }
    } catch (reason) {
      refreshAcknowledgement.current = null;
      if (!isCurrent(ticket)) return;
      setState("ready");
      setError(
        reason instanceof Error
          ? reason.message
          : "The selected sources could not be refreshed.",
      );
    }
  }

  if (!groups.length) return null;

  return (
    <section
      className="vault-source-review"
      aria-labelledby="vault-source-review-title"
    >
      <div className="vault-source-review__heading">
        <h2 id="vault-source-review-title">
          Vault sources
          <span className="vault-source-review__total">
            {groups.reduce((total, group) => total + group.sources.length, 0)}{" "}
            notes
          </span>
        </h2>
        <InkButton
          type="button"
          className="button vault-source-review__check"
          onClick={() => void inspect()}
          disabled={state === "checking" || state === "refreshing"}
        >
          {state === "checking" ? (
            <LoaderCircle
              className="vault-source-review__spin"
              size={15}
              aria-hidden="true"
            />
          ) : (
            <RefreshCw size={15} aria-hidden="true" />
          )}
          {state === "checking"
            ? "Checking…"
            : reviewed
              ? "Check again"
              : "Check changes"}
        </InkButton>
      </div>

      <div className="vault-source-review__status" aria-live="polite">
        {error && (
          <span
            className="vault-source-review__message vault-source-review__message--error"
            role="alert"
          >
            <AlertCircle size={15} aria-hidden="true" />
            {error}
          </span>
        )}
        {!error && notice && (
          <span className="vault-source-review__message vault-source-review__message--notice">
            <Check size={15} aria-hidden="true" />
            {notice}
          </span>
        )}
      </div>

      <div className="vault-source-review__vaults">
        {groups.map((group) => {
          const review = reviews[group.vaultId];
          const result = review?.result;
          const unavailable = review?.error?.unavailable;
          const changes = result?.changes || [];
          return (
            <details
              className="vault-source-review__vault"
              key={group.vaultId}
              open={!!review && openVaults.has(group.vaultId)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setOpenVaults((current) => {
                  const next = new Set(current);
                  if (open) next.add(group.vaultId);
                  else next.delete(group.vaultId);
                  return next;
                });
              }}
            >
              <summary>
                <span className="vault-source-review__vault-name">
                  <span>{group.vaultName}</span>
                  <small>
                    {group.sources.length} linked{" "}
                    {group.sources.length === 1 ? "source" : "sources"}
                  </small>
                </span>
                {result ? (
                  <span
                    className="vault-source-review__counts"
                    aria-label={`${group.sources.length} linked${result.counts.unchanged ? `, ${result.counts.unchanged} current` : ""}${result.counts.changed ? `, ${result.counts.changed} changed` : ""}${result.counts.missing ? `, ${result.counts.missing} missing` : ""}`}
                  >
                    {group.sources.length > 0 && (
                      <span className="vault-source-review__count vault-source-review__count--linked">
                        {group.sources.length} linked
                      </span>
                    )}
                    {result.counts.unchanged > 0 && (
                      <span className="vault-source-review__count vault-source-review__count--current">
                        {result.counts.unchanged} current
                      </span>
                    )}
                    {result.counts.changed > 0 && (
                      <span className="vault-source-review__count vault-source-review__count--changed">
                        {result.counts.changed} changed
                      </span>
                    )}
                    {result.counts.missing > 0 && (
                      <span className="vault-source-review__count vault-source-review__count--missing">
                        {result.counts.missing} missing
                      </span>
                    )}
                  </span>
                ) : unavailable ? (
                  <span className="vault-source-review__unavailable">
                    <AlertCircle size={14} aria-hidden="true" /> Unavailable
                  </span>
                ) : (
                  <span className="vault-source-review__not-checked">
                    Not checked
                  </span>
                )}
                <ChevronDown
                  className="vault-source-review__chevron"
                  size={16}
                  aria-hidden="true"
                />
              </summary>

              {review?.error ? (
                <div
                  className="vault-source-review__unavailable-panel"
                  role="alert"
                >
                  <div>
                    <AlertCircle size={18} aria-hidden="true" />
                    <strong>
                      {review.error.unavailable
                        ? "Vault unavailable"
                        : "Review failed"}
                    </strong>
                  </div>
                  <p>{review.error.message}</p>
                  {review.error.unavailable && (
                    <p>
                      Saved source snapshots remain usable. Reconnect this
                      folder before checking or refreshing its live notes.
                    </p>
                  )}
                </div>
              ) : result ? (
                <>
                  <div
                    className="vault-source-review__list"
                    aria-label={`${group.vaultName} source changes`}
                  >
                    {changes.map((change) => {
                      const selectable = change.status === "changed";
                      const isSelected = selected.has(change.sourceId);
                      const source = group.sources.find(
                        (item) => item.id === change.sourceId,
                      );
                      const snapshots = snapshotCount(change);
                      const comparison = comparisons[change.sourceId];
                      const comparisonText =
                        comparison?.status === "ready" &&
                        comparison.live &&
                        source
                          ? comparisonExcerpt(
                              source.text,
                              comparison.live.text,
                              comparison.fullText,
                            )
                          : null;
                      return (
                        <div
                          className={`vault-source-review__row ${isSelected ? "is-selected" : ""}`}
                          key={change.sourceId}
                        >
                          <InkInput
                            type="checkbox"
                            checked={isSelected}
                            disabled={!selectable || state === "refreshing"}
                            aria-label={`${selectable ? "Select" : "Cannot refresh"} ${change.path}`}
                            onChange={() => toggleSelected(change.sourceId)}
                          />
                          <div className="vault-source-review__row-main">
                            <div className="vault-source-review__path-line">
                              <strong title={change.path}>{change.path}</strong>
                              <span className={statusClass(change.status)}>
                                {statusIcon(change.status)}
                                {statusLabel(change.status)}
                              </span>
                            </div>
                            {change.status === "changed" && source && (
                              <InkButton
                                type="button"
                                className="vault-source-review__compare"
                                onClick={() =>
                                  void compareChange(
                                    group.vaultId,
                                    change,
                                    source,
                                  )
                                }
                                disabled={comparison?.status === "loading"}
                              >
                                {comparison?.status === "loading"
                                  ? "Loading comparison…"
                                  : comparison?.status === "ready"
                                    ? comparison.fullText
                                      ? "Show context"
                                      : "Show full text"
                                    : "Compare changes"}
                              </InkButton>
                            )}
                            <details className="vault-source-review__revisions">
                              <summary>Revisions</summary>
                              <span>
                                Saved{" "}
                                <code>
                                  {shortRevision(change.originalRevision)}
                                </code>
                              </span>
                              <span aria-hidden="true">→</span>
                              <span>
                                Live{" "}
                                <code>
                                  {shortRevision(change.currentRevision)}
                                </code>
                              </span>
                            </details>
                            {snapshots > 0 && (
                              <span className="vault-source-review__snapshots">
                                <CircleHelp size={13} aria-hidden="true" />
                                {snapshots} historical{" "}
                                {snapshots === 1 ? "snapshot" : "snapshots"}
                              </span>
                            )}
                            {change.issue && (
                              <p className="vault-source-review__issue">
                                {change.issue}
                              </p>
                            )}
                            {comparison?.status === "error" && (
                              <p
                                className="vault-source-review__compare-error"
                                role="alert"
                              >
                                {comparison.error}
                              </p>
                            )}
                            {comparisonText && source && (
                              <div className="vault-source-review__comparison">
                                <p className="vault-source-review__comparison-note">
                                  Compare the saved source with the current
                                  vault note.
                                  {comparisonText.omitted &&
                                    " Context is shown around the first changed region; omitted text is marked."}
                                </p>
                                <div className="vault-source-review__comparison-columns">
                                  <section>
                                    <h4>Saved snapshot</h4>
                                    <pre>{comparisonText.before}</pre>
                                  </section>
                                  <section>
                                    <h4>Live note</h4>
                                    <pre>{comparisonText.after}</pre>
                                  </section>
                                </div>
                              </div>
                            )}
                          </div>
                          {onOpenVaultNote && source && (
                            <InkButton
                              type="button"
                              className="icon-button vault-source-review__open"
                              title="Open live note"
                              aria-label={`Open ${change.path} in the vault workspace`}
                              onClick={() =>
                                onOpenVaultNote(group.vaultId, change.path)
                              }
                            >
                              <ExternalLink size={15} aria-hidden="true" />
                            </InkButton>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <details className="vault-source-review__tradeoff">
                    <summary>What refreshing changes</summary>
                    <p>{result.tradeoff}</p>
                  </details>
                  {result.counts.changed > 0 && (
                    <div className="vault-source-review__refresh-bar">
                      <span>
                        {selectedChangedCount
                          ? `${selectedChangedCount} changed selected`
                          : "Select changed sources to refresh"}
                      </span>
                      <InkButton
                        type="button"
                        className="button"
                        onClick={() => void refreshSelected()}
                        disabled={
                          !selectedChangedCount || state === "refreshing"
                        }
                      >
                        {state === "refreshing" ? (
                          <LoaderCircle
                            className="vault-source-review__spin"
                            size={15}
                            aria-hidden="true"
                          />
                        ) : (
                          <RefreshCw size={15} aria-hidden="true" />
                        )}
                        {state === "refreshing"
                          ? "Refreshing…"
                          : "Refresh selected"}
                      </InkButton>
                    </div>
                  )}
                </>
              ) : (
                <p className="vault-source-review__prompt">
                  Run a check to compare these saved snapshots with the current
                  files.
                </p>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
