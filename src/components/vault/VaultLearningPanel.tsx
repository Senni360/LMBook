import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileText,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { subjects, type Subject } from "../../../shared/model";
import type {
  VaultLearningDestination,
  VaultLearningImportResult,
  VaultLearningPreview,
} from "../../../shared/vault-learning";
import { InkButton, InkInput, InkSelect, InkTextarea } from "../InkControl";
import "./vault-learning.css";

type NotebookOption = {
  id: string;
  title: string;
  subject?: string;
  example?: boolean;
};

export type VaultLearningPanelProps = {
  vaultId: string;
  selectedPaths: string[];
  notebooks: NotebookOption[];
  currentNotebook: string | null;
  pendingPaths: string[];
  onRemove: (path: string) => void;
  onClear: () => void;
  onImported: (result: VaultLearningImportResult) => void | Promise<void>;
  onDraftSummary: (notebookId: string, prompt: string) => Promise<void>;
  generating: boolean;
};

async function request<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sennibook": "1" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!response.ok)
    throw Object.assign(
      new Error(
        result?.error || "The vault learning service could not be reached.",
      ),
      { status: response.status },
    );
  return result as T;
}

const subjectOptions = subjects;
const defaultPrompt =
  "Summarize the main ideas, preserve important terms and qualifications, and point out anything these notes leave unclear.";

type PersistedSetup = {
  destinationKind?: "existing" | "new";
  existingNotebookId?: string;
  newTitle?: string;
  newSubject?: Subject;
  newLanguage?: "en" | "nl";
  settingsSourceId?: string;
  sourceKind?: "course" | "supplement";
  summaryPrompt?: string;
};

function setupKey(vaultId: string) {
  return `lmbook:vault-learning:${vaultId}`;
}

function readSetup(vaultId: string): PersistedSetup {
  if (!vaultId) return {};
  try {
    const raw = localStorage.getItem(setupKey(vaultId));
    return raw ? (JSON.parse(raw) as PersistedSetup) : {};
  } catch {
    return {};
  }
}

function saveSetup(vaultId: string, setup: PersistedSetup) {
  if (!vaultId) return;
  try {
    localStorage.setItem(setupKey(vaultId), JSON.stringify(setup));
  } catch {
    // Setup persistence is helpful, but it must not block vault learning.
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortRevision(revision: string | null) {
  return revision ? `${revision.slice(0, 10)}…` : "unavailable";
}

export function VaultLearningPanel({
  vaultId,
  selectedPaths,
  notebooks,
  currentNotebook,
  pendingPaths,
  onRemove,
  onClear,
  onImported,
  onDraftSummary,
  generating,
}: VaultLearningPanelProps) {
  const firstNotebook = currentNotebook || notebooks[0]?.id || "";
  const initialSetup = readSetup(vaultId);
  const [destinationKind, setDestinationKind] = useState<"existing" | "new">(
    initialSetup.destinationKind || (firstNotebook ? "existing" : "new"),
  );
  const [existingNotebookId, setExistingNotebookId] = useState(
    initialSetup.existingNotebookId || firstNotebook,
  );
  const [newTitle, setNewTitle] = useState(
    initialSetup.newTitle || "Untitled learning notebook",
  );
  const [newSubject, setNewSubject] = useState<Subject>(
    initialSetup.newSubject || "Politics",
  );
  const [newLanguage, setNewLanguage] = useState<"en" | "nl">(
    initialSetup.newLanguage || "en",
  );
  const [settingsSourceId, setSettingsSourceId] = useState(
    initialSetup.settingsSourceId || "",
  );
  const [sourceKind, setSourceKind] = useState<"course" | "supplement">(
    initialSetup.sourceKind || "course",
  );
  const [preview, setPreview] = useState<VaultLearningPreview | null>(null);
  const [reviewedKey, setReviewedKey] = useState("");
  const [busy, setBusy] = useState<"review" | "import" | "summary" | "">("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<VaultLearningImportResult | null>(
    null,
  );
  const [summaryPrompt, setSummaryPrompt] = useState(
    initialSetup.summaryPrompt || defaultPrompt,
  );
  const restoredVault = useRef("");
  const restoringVault = useRef(false);
  const requestSerial = useRef(0);

  useEffect(() => {
    const saved = readSetup(vaultId);
    restoringVault.current = true;
    restoredVault.current = vaultId;
    setDestinationKind(
      saved.destinationKind || (currentNotebook ? "existing" : "new"),
    );
    setExistingNotebookId(saved.existingNotebookId || currentNotebook || "");
    setNewTitle(saved.newTitle || "Untitled learning notebook");
    setNewSubject(saved.newSubject || "Politics");
    setNewLanguage(saved.newLanguage || "en");
    setSettingsSourceId(saved.settingsSourceId || "");
    setSourceKind(saved.sourceKind || "course");
    setSummaryPrompt(saved.summaryPrompt || defaultPrompt);
    setPreview(null);
    setReviewedKey("");
    setSuccess(null);
    setError("");
    requestSerial.current += 1;
    queueMicrotask(() => {
      if (restoredVault.current === vaultId) restoringVault.current = false;
    });
  }, [vaultId]);

  useEffect(() => {
    if (
      destinationKind === "existing" &&
      !existingNotebookId &&
      currentNotebook &&
      notebooks.some((notebook) => notebook.id === currentNotebook)
    )
      setExistingNotebookId(currentNotebook);
  }, [currentNotebook, destinationKind, existingNotebookId, notebooks]);

  useEffect(() => {
    if (
      destinationKind === "existing" &&
      notebooks.length > 0 &&
      !existingNotebookId
    )
      setExistingNotebookId(notebooks[0]?.id || "");
  }, [destinationKind, existingNotebookId, notebooks]);

  useEffect(() => {
    if (!vaultId || restoredVault.current !== vaultId || restoringVault.current)
      return;
    saveSetup(vaultId, {
      destinationKind,
      existingNotebookId,
      newTitle,
      newSubject,
      newLanguage,
      settingsSourceId,
      sourceKind,
      summaryPrompt,
    });
  }, [
    destinationKind,
    existingNotebookId,
    newLanguage,
    newSubject,
    newTitle,
    settingsSourceId,
    sourceKind,
    summaryPrompt,
    vaultId,
  ]);

  const destination = useMemo<VaultLearningDestination | null>(() => {
    if (destinationKind === "existing")
      return existingNotebookId
        ? { kind: "existing", notebookId: existingNotebookId }
        : null;
    return {
      kind: "new",
      title: newTitle,
      subject: newSubject,
      language: newLanguage,
      ...(settingsSourceId ? { settingsFromNotebookId: settingsSourceId } : {}),
    };
  }, [
    destinationKind,
    existingNotebookId,
    newLanguage,
    newSubject,
    newTitle,
    settingsSourceId,
  ]);

  const reviewKey = useMemo(
    () =>
      JSON.stringify({
        vaultId,
        paths: selectedPaths,
        destination,
        kind: sourceKind,
      }),
    [destination, selectedPaths, sourceKind, vaultId],
  );
  useEffect(() => {
    requestSerial.current += 1;
  }, [reviewKey]);
  const isReviewed = !!preview && reviewedKey === reviewKey;
  const selectedPending = pendingPaths.filter((path) =>
    selectedPaths.includes(path),
  ).length;
  const hasIssues = !!preview?.issue || !!preview?.counts.issues;
  const canImport =
    isReviewed &&
    !hasIssues &&
    !!selectedPaths.length &&
    !selectedPending &&
    !!destination &&
    !busy &&
    !generating;
  const summaryNotebookId =
    destinationKind === "existing" ? existingNotebookId : "";

  function remove(path: string) {
    setSuccess(null);
    onRemove(path);
  }

  async function reviewSelection() {
    if (!selectedPaths.length || !destination) return;
    const serial = ++requestSerial.current;
    const targetVaultId = vaultId;
    const targetReviewKey = reviewKey;
    const current = () =>
      requestSerial.current === serial &&
      vaultId === targetVaultId &&
      reviewKey === targetReviewKey;
    setBusy("review");
    setError("");
    setSuccess(null);
    try {
      const result = await request<VaultLearningPreview>(
        `/vaults/${encodeURIComponent(targetVaultId)}/learning/preview`,
        { paths: selectedPaths, destination },
      );
      if (!current()) return;
      setPreview(result);
      setReviewedKey(targetReviewKey);
    } catch (reason) {
      if (!current()) return;
      setError(reason instanceof Error ? reason.message : "Review failed.");
      setPreview(null);
      setReviewedKey("");
    } finally {
      setBusy((value) => (value === "review" ? "" : value));
    }
  }

  async function importSelection() {
    if (!canImport || !preview || !destination) return;
    const serial = ++requestSerial.current;
    const targetVaultId = vaultId;
    const targetReviewKey = reviewKey;
    const current = () =>
      requestSerial.current === serial &&
      vaultId === targetVaultId &&
      reviewKey === targetReviewKey;
    setBusy("import");
    setError("");
    try {
      const revisions = Object.fromEntries(
        preview.notes
          .filter((note) => note.revision)
          .map((note) => [note.path, note.revision]),
      );
      const result = await request<VaultLearningImportResult>(
        `/vaults/${encodeURIComponent(targetVaultId)}/learning/import`,
        {
          paths: selectedPaths,
          destination,
          kind: sourceKind,
          revisions,
        },
      );
      if (!current()) return;
      setSuccess(result);
      if (destination.kind === "new") {
        setDestinationKind("existing");
        setExistingNotebookId(result.notebookId);
      }
      try {
        await onImported(result);
      } catch {
        if (vaultId === targetVaultId)
          setError(
            "The sources were saved, but the notebook list could not refresh. Reopen the notebook list to see the new sources.",
          );
      }
    } catch (reason) {
      if (!current()) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "The notes could not be imported.",
      );
    } finally {
      setBusy((value) => (value === "import" ? "" : value));
    }
  }

  async function draftSummary() {
    if (!summaryNotebookId || !summaryPrompt.trim() || busy || generating)
      return;
    setBusy("summary");
    setError("");
    try {
      await onDraftSummary(summaryNotebookId, summaryPrompt.trim());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The summary draft could not be started.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      className="vault-learning-panel"
      aria-label="Review and import selected notes"
    >
      <div className="vault-learning-panel__heading">
        <div className="vault-learning-panel__heading-copy">
          <p>
            Save copies of the selected notes as sources for questions,
            flashcards and audio.
          </p>
        </div>
      </div>

      <div className="vault-learning-panel__selection-bar">
        <div>
          {selectedPending > 0 ? (
            <span className="vault-learning-panel__pending" role="alert">
              Save or discard unfinished edits in {selectedPending} selected{" "}
              {selectedPending === 1 ? "note" : "notes"} first.
            </span>
          ) : (
            <span>
              {selectedPaths.length}{" "}
              {selectedPaths.length === 1 ? "note" : "notes"} selected
            </span>
          )}
        </div>
        {!!selectedPaths.length && (
          <InkButton
            className="button quiet"
            onClick={onClear}
            disabled={!!busy}
          >
            Clear selection
          </InkButton>
        )}
      </div>

      {!!selectedPaths.length && (
        <details
          className="vault-learning-panel__paths"
          open={selectedPaths.length <= 5}
        >
          <summary>
            <span>Selected notes</span>
            <span className="vault-learning-panel__summary-count">
              {selectedPaths.length} <ChevronDown size={14} />
            </span>
          </summary>
          <div className="vault-learning-panel__path-list">
            {selectedPaths.map((path) => (
              <div className="vault-learning-panel__path" key={path}>
                <FileText size={15} />
                <span title={path}>{path}</span>
                <InkButton
                  className="icon-button"
                  aria-label={`Remove ${path}`}
                  title="Remove from selection"
                  onClick={() => remove(path)}
                  disabled={!!busy}
                >
                  <X size={15} />
                </InkButton>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="vault-learning-panel__destination">
        <div className="vault-learning-panel__section-title">
          <div>
            <span className="vault-learning-panel__kicker">
              01 · Destination
            </span>
            <h3>Choose a notebook</h3>
          </div>
          <BookOpen size={21} strokeWidth={1.5} />
        </div>
        <div
          className="vault-learning-panel__choices"
          role="group"
          aria-label="Notebook destination"
        >
          <InkButton
            className={`vault-learning-panel__choice ${destinationKind === "existing" ? "is-active" : ""}`}
            onClick={() => setDestinationKind("existing")}
            disabled={!notebooks.length || !!busy}
            aria-pressed={destinationKind === "existing"}
          >
            <strong>Existing notebook</strong>
            <span>Add these notes to your saved sources.</span>
          </InkButton>
          <InkButton
            className={`vault-learning-panel__choice ${destinationKind === "new" ? "is-active" : ""}`}
            onClick={() => setDestinationKind("new")}
            disabled={!!busy}
            aria-pressed={destinationKind === "new"}
          >
            <strong>New notebook</strong>
            <span>Create a notebook from these notes.</span>
          </InkButton>
        </div>

        {destinationKind === "existing" ? (
          <label className="vault-learning-panel__field">
            <span>Learning notebook</span>
            <InkSelect
              value={existingNotebookId}
              disabled={!notebooks.length || !!busy}
              onChange={(event) => setExistingNotebookId(event.target.value)}
            >
              {!notebooks.length && <option value="">No notebooks yet</option>}
              {notebooks.map((notebook) => (
                <option value={notebook.id} key={notebook.id}>
                  {notebook.title}
                  {notebook.subject ? ` · ${notebook.subject}` : ""}
                </option>
              ))}
            </InkSelect>
          </label>
        ) : (
          <div className="vault-learning-panel__new-fields">
            <label className="vault-learning-panel__field vault-learning-panel__field--wide">
              <span>Notebook title</span>
              <InkInput
                value={newTitle}
                maxLength={180}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="e.g. The Roman Republic"
              />
            </label>
            <label className="vault-learning-panel__field">
              <span>Subject</span>
              <InkSelect
                value={newSubject}
                disabled={!!busy}
                onChange={(event) =>
                  setNewSubject(event.target.value as Subject)
                }
              >
                {subjectOptions.map((subject) => (
                  <option value={subject} key={subject}>
                    {subject}
                  </option>
                ))}
              </InkSelect>
            </label>
            <label className="vault-learning-panel__field">
              <span>Language</span>
              <InkSelect
                value={newLanguage}
                disabled={!!busy}
                onChange={(event) =>
                  setNewLanguage(event.target.value as "en" | "nl")
                }
              >
                <option value="en">English</option>
                <option value="nl">Nederlands</option>
              </InkSelect>
            </label>
            <label className="vault-learning-panel__field vault-learning-panel__field--wide">
              <span>
                Copy settings from <small>(optional)</small>
              </span>
              <InkSelect
                value={settingsSourceId}
                disabled={!!busy}
                onChange={(event) => setSettingsSourceId(event.target.value)}
              >
                <option value="">Use the standard learning setup</option>
                {notebooks.map((notebook) => (
                  <option value={notebook.id} key={notebook.id}>
                    {notebook.title}
                  </option>
                ))}
              </InkSelect>
            </label>
          </div>
        )}

        <div className="vault-learning-panel__type-row">
          <span>How should these sources be treated?</span>
          <div
            className="vault-learning-panel__type-toggle"
            role="group"
            aria-label="Source type"
          >
            {(["course", "supplement"] as const).map((kind) => (
              <InkButton
                key={kind}
                className={sourceKind === kind ? "is-active" : ""}
                onClick={() => setSourceKind(kind)}
                disabled={!!busy}
                aria-pressed={sourceKind === kind}
              >
                {kind === "course"
                  ? "Required course material"
                  : "Supporting material"}
              </InkButton>
            ))}
          </div>
        </div>
      </div>

      <div className="vault-learning-panel__review">
        <div className="vault-learning-panel__section-title">
          <div>
            <span className="vault-learning-panel__kicker">02 · Review</span>
            <h3>Review selected notes</h3>
          </div>
          <FileText size={21} strokeWidth={1.5} />
        </div>
        <p className="vault-learning-panel__helper">
          LMBook checks that each file still matches this review before it is
          saved. Duplicate snapshots stay untouched.
        </p>
        <div className="vault-learning-panel__review-actions">
          <InkButton
            className="button"
            onClick={() => void reviewSelection()}
            disabled={
              !selectedPaths.length ||
              !destination ||
              !!selectedPending ||
              !!busy ||
              generating
            }
          >
            {busy === "review" ? (
              <LoaderCircle className="vault-learning-panel__spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            {busy === "review"
              ? "Reviewing…"
              : isReviewed
                ? "Review again"
                : "Review selected notes"}
          </InkButton>
          {preview && isReviewed && (
            <span className="vault-learning-panel__reviewed" role="status">
              <CheckCircle2 size={15} /> Review captured
            </span>
          )}
        </div>

        {preview && isReviewed && (
          <div className="vault-learning-panel__preview" aria-live="polite">
            <div className="vault-learning-panel__metrics">
              <span>
                <strong>{preview.counts.ready}</strong> ready
              </span>
              <span>
                <strong>{preview.counts.words.toLocaleString()}</strong> words
              </span>
              <span>
                <strong>{formatBytes(preview.counts.bytes)}</strong>
              </span>
              {!!preview.counts.duplicates && (
                <span className="is-muted">
                  <strong>{preview.counts.duplicates}</strong> already saved
                </span>
              )}
            </div>
            <div className="vault-learning-panel__note-list">
              {preview.notes.map((note) => (
                <article
                  className={`vault-learning-panel__note ${note.issue ? "is-issue" : note.existing ? "is-duplicate" : "is-ready"}`}
                  key={note.path}
                >
                  <div className="vault-learning-panel__note-icon">
                    {note.issue ? (
                      <CircleAlert size={17} />
                    ) : note.existing ? (
                      <Check size={17} />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                  </div>
                  <div className="vault-learning-panel__note-body">
                    <strong title={note.path}>{note.path}</strong>
                    <span>
                      {note.issue ||
                        (note.existing
                          ? `Already saved as ${note.existing.title}`
                          : `${note.words.toLocaleString()} words · ${formatBytes(note.bytes)}`)}
                    </span>
                    <small>Revision {shortRevision(note.revision)}</small>
                  </div>
                  <InkButton
                    className="icon-button"
                    aria-label={`Remove ${note.path}`}
                    title="Remove from selection"
                    onClick={() => remove(note.path)}
                    disabled={!!busy}
                  >
                    <X size={15} />
                  </InkButton>
                </article>
              ))}
            </div>
            {preview.issue && (
              <p className="vault-learning-panel__inline-error" role="alert">
                <CircleAlert size={15} /> {preview.issue}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="vault-learning-panel__finish">
        <div className="vault-learning-panel__section-title">
          <div>
            <span className="vault-learning-panel__kicker">03 · Save</span>
            <h3>Add to the notebook</h3>
          </div>
          <CheckCircle2 size={21} strokeWidth={1.5} />
        </div>
        <div className="vault-learning-panel__finish-actions">
          <InkButton
            className="button primary"
            onClick={() => void importSelection()}
            disabled={!canImport}
          >
            {busy === "import" ? (
              <LoaderCircle className="vault-learning-panel__spin" size={16} />
            ) : (
              <BookOpen size={16} />
            )}
            {busy === "import" ? "Saving sources…" : "Import reviewed notes"}
          </InkButton>
          {!isReviewed && selectedPaths.length > 0 && (
            <span className="vault-learning-panel__action-note">
              Review the selection before importing.
            </span>
          )}
        </div>
        {success && (
          <div className="vault-learning-panel__success" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>
                {success.added
                  ? `${success.added} ${success.added === 1 ? "source" : "sources"} added`
                  : "No new sources needed"}
              </strong>
              <span>
                {success.title} ·{" "}
                {success.unchanged
                  ? `${success.unchanged} unchanged`
                  : "Ready for the next learning step."}
              </span>
            </div>
          </div>
        )}
        {error && (
          <p className="vault-learning-panel__inline-error" role="alert">
            <CircleAlert size={15} /> {error}
          </p>
        )}
      </div>

      <details className="vault-learning-panel__summary">
        <summary>
          <span>Write a study summary into the vault</span>
          <ChevronDown size={15} />
        </summary>
        {destinationKind === "existing" && summaryNotebookId ? (
          <div className="vault-learning-panel__summary-body">
            <p>
              Use the selected notes and this notebook’s learning settings to
              draft a new Markdown note for review.
            </p>
            <label className="vault-learning-panel__field">
              <span>What should the summary help you understand?</span>
              <InkTextarea
                rows={3}
                maxLength={5000}
                value={summaryPrompt}
                disabled={!!busy || generating}
                onChange={(event) => setSummaryPrompt(event.target.value)}
              />
            </label>
            <InkButton
              className="button"
              onClick={() => void draftSummary()}
              disabled={
                !selectedPaths.length ||
                !summaryPrompt.trim() ||
                !!busy ||
                generating
              }
            >
              {busy === "summary" || generating ? (
                <LoaderCircle
                  className="vault-learning-panel__spin"
                  size={16}
                />
              ) : (
                <Sparkles size={16} />
              )}
              {generating ? "Drafting summary…" : "Draft summary"}
            </InkButton>
          </div>
        ) : (
          <p className="vault-learning-panel__summary-note">
            Import these notes into the new notebook first. Then choose it here
            to draft a summary with its learning settings.
          </p>
        )}
      </details>
    </section>
  );
}
