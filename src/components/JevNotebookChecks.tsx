import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, ChevronDown } from "lucide-react";
import { InkButton, InkInput, InkSelect } from "./InkControl";
import { ResizableCard } from "./ResizableCard";
import { aiApi } from "../ai-api";
import type {
  NotebookReport,
  NotebookSource,
  NotebookState,
  NotebookCheckKind,
} from "../../shared/jev-notebook";
import "./jev-notebook.css";

const checks: { id: NotebookCheckKind; label: string }[] = [
  { id: "organization", label: "Classify sources" },
  { id: "relationships", label: "Find source relationships" },
  { id: "learningGoal", label: "Check learning goal" },
  { id: "chatQuestion", label: "Check chat question" },
  { id: "flashcardQuality", label: "Inspect flashcards" },
];
export function JevNotebookChecks({ notebookId }: { notebookId: string }) {
  const [state, setState] = useState<NotebookState | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedChecks, setSelectedChecks] = useState<NotebookCheckKind[]>([
    "organization",
    "relationships",
  ]);
  const [selectedDeck, setSelectedDeck] = useState("");
  const [open, setOpen] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState("");
  const [goal, setGoal] = useState("");
  const [question, setQuestion] = useState("");
  const [format, setFormat] = useState<
    "explanation" | "calculation" | "application"
  >("explanation");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const readRevision = useRef(0);
  const mutations = useRef(0);
  const beginMutation = () => {
    mutations.current++;
    readRevision.current++;
  };
  const endMutation = () => {
    mutations.current--;
    readRevision.current++;
  };
  const working = busy || Boolean(state?.active);
  const read = async () => {
    const revision = ++readRevision.current;
    const next = await aiApi<NotebookState>(
      `/notebooks/${notebookId}/jev-notebook`,
    );
    if (revision === readRevision.current && mutations.current === 0)
      setState(next);
  };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const poll = async () => {
      const revision = ++readRevision.current;
      let running = false;
      try {
        const next = await aiApi<NotebookState>(
          `/notebooks/${notebookId}/jev-notebook`,
        );
        running = Boolean(next.active);
        if (
          !cancelled &&
          revision === readRevision.current &&
          mutations.current === 0
        )
          setState(next);
      } catch (e) {
        if (
          !cancelled &&
          revision === readRevision.current &&
          mutations.current === 0
        )
          setError((e as Error).message);
      } finally {
        if (!cancelled && (running || open))
          timer = setTimeout(poll, running ? 1500 : 8000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      readRevision.current++;
      if (timer) clearTimeout(timer);
    };
  }, [notebookId, open]);
  const toggle = (id: string) =>
    setSelected((v) =>
      v.includes(id)
        ? v.filter((x) => x !== id)
        : v.length >= 12
          ? v
          : [...v, id],
    );
  const selectAll = () =>
    setSelected(state?.sources.slice(0, 12).map((source) => source.id) || []);
  const clearSelected = () => setSelected([]);
  const run = async () => {
    if (!selected.length) return setError("Select at least one source.");
    if (selectedChecks.includes("learningGoal") && !goal.trim())
      return setError("Add a learning goal for this check.");
    if (selectedChecks.includes("chatQuestion") && !question.trim())
      return setError("Add a question for this check.");
    setBusy(true);
    beginMutation();
    setError("");
    try {
      const report = await aiApi<NotebookReport>(
        `/notebooks/${notebookId}/jev-notebook/run`,
        "POST",
        {
          selectedSourceIds: selected,
          checks: selectedChecks,
          learningGoal: goal,
          chatQuestion: question,
          format,
          deckId: selectedDeck || undefined,
        },
      );
      setState(
        (v) =>
          v && {
            ...v,
            active: null,
            reports: [
              report,
              ...v.reports.filter((r) => r.id !== report.id),
            ].slice(0, 20),
          },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endMutation();
      setBusy(false);
    }
  };
  const cancel = async () => {
    beginMutation();
    try {
      await aiApi(`/notebooks/${notebookId}/jev-notebook/cancel`, "POST");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endMutation();
      setBusy(false);
      void read().catch((e) => setError((e as Error).message));
    }
  };
  const feedback = async (
    reportId: string,
    itemId: string,
    value: "helpful" | "not-helpful",
  ) => {
    setFeedbackBusy(itemId);
    beginMutation();
    setError("");
    try {
      await aiApi(`/notebooks/${notebookId}/jev-notebook/feedback`, "POST", {
        reportId,
        itemId,
        value,
      });
      setState(
        (v) =>
          v && {
            ...v,
            reports: v.reports.map((r) =>
              r.id === reportId
                ? { ...r, feedback: { ...r.feedback, [itemId]: value } }
                : r,
            ),
          },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      endMutation();
      setFeedbackBusy("");
    }
  };
  if (!state)
    return (
      <section className="jev-checks">
        <strong>Jev notebook checks</strong>
        <p>{error || "Loading…"}</p>
      </section>
    );
  return (
    <section className="jev-checks" aria-label="Jev notebook checks">
      <div className="jev-checks-heading">
        <InkButton
          className="button quiet jev-collapse"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <ClipboardCheck size={16} aria-hidden="true" />
          <strong>Notebook checks</strong>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={open ? "is-open" : ""}
          />
        </InkButton>
        {state.available ? (
          <span className="jev-ready">Connected</span>
        ) : (
          <span className="jev-muted">
            Enable Notebook checks in Settings · Connect Jev
          </span>
        )}
      </div>
      {open && (
        <ResizableCard
          storageKey={`lmbook:jev-height:${notebookId}`}
          label="notebook checks"
          minHeight={200}
          defaultHeight={440}
          className="jev-resize-card"
          contentClassName="jev-checks-body"
        >
          <p>
            Review selected evidence with TypeSafe Jev. Confidence is a model
            estimate, not a guarantee.
          </p>
          <p className="fine-print">
            Sends the first 6,000 characters of each selected source to
            TypeSafe. Reviews up to 12 source pairs and 12 cards per run.
          </p>
          <div className="jev-source-list">
            <div className="jev-source-tools">
              <div className="jev-label">
                Sources ({selected.length}/12 selected)
              </div>
              <div>
                <InkButton type="button" onClick={selectAll} disabled={working}>
                  Select first 12
                </InkButton>
                <InkButton
                  type="button"
                  onClick={clearSelected}
                  disabled={busy || !selected.length}
                >
                  Deselect all
                </InkButton>
              </div>
            </div>
            {state.sources.map((source: NotebookSource) => (
              <label key={source.id} className="jev-source">
                <InkInput
                  type="checkbox"
                  checked={selected.includes(source.id)}
                  onChange={() => toggle(source.id)}
                  disabled={working}
                />
                <span>
                  <b>{source.title}</b>
                  <small>{source.excerpt}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="jev-check-options">
            <div className="jev-label">Checks</div>
            {checks.map((c) => (
              <label key={c.id}>
                <InkInput
                  type="checkbox"
                  checked={selectedChecks.includes(c.id)}
                  onChange={() =>
                    setSelectedChecks((v) =>
                      v.includes(c.id)
                        ? v.filter((x) => x !== c.id)
                        : [...v, c.id],
                    )
                  }
                  disabled={working}
                />
                {c.label}
              </label>
            ))}
          </div>
          <div className="jev-fields">
            <label>
              Learning goal
              <InkInput
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                disabled={working || !selectedChecks.includes("learningGoal")}
                placeholder={
                  selectedChecks.includes("learningGoal")
                    ? "Required for this check"
                    : "Enable goal check first"
                }
              />
            </label>
            <label>
              Question
              <InkInput
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={working || !selectedChecks.includes("chatQuestion")}
                placeholder={
                  selectedChecks.includes("chatQuestion")
                    ? "Required for this check"
                    : "Enable question check first"
                }
              />
            </label>
            <label>
              Needed format
              <InkSelect
                aria-label="Needed format"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
                disabled={working}
              >
                <option value="explanation">Explanation</option>
                <option value="calculation">Calculation</option>
                <option value="application">Application</option>
              </InkSelect>
            </label>
            {selectedChecks.includes("flashcardQuality") && (
              <label>
                Saved deck
                <InkSelect
                  aria-label="Saved deck"
                  value={selectedDeck}
                  onChange={(e) => setSelectedDeck(e.target.value)}
                  disabled={working}
                >
                  <option value="">Choose a deck</option>
                  {state.decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.title} · {deck.count} cards (first 12)
                    </option>
                  ))}
                </InkSelect>
              </label>
            )}
          </div>
          {error && <p className="jev-error">{error}</p>}
          <div className="jev-actions">
            {working ? (
              <InkButton onClick={() => void cancel()}>Cancel run</InkButton>
            ) : (
              <InkButton
                onClick={() => void run()}
                disabled={
                  !state.available ||
                  !selectedChecks.length ||
                  !selected.length ||
                  (selectedChecks.includes("flashcardQuality") && !selectedDeck)
                }
              >
                Run selected checks
              </InkButton>
            )}
          </div>
          <div className="jev-reports">
            {state.reports.map((report) => (
              <Report
                key={report.id}
                report={report}
                onFeedback={feedback}
                feedbackBusy={feedbackBusy}
              />
            ))}
          </div>
        </ResizableCard>
      )}
    </section>
  );
}
function Report({
  report,
  onFeedback,
  feedbackBusy,
}: {
  report: NotebookReport;
  onFeedback: (
    r: string,
    i: string,
    v: "helpful" | "not-helpful",
  ) => Promise<void>;
  feedbackBusy: string;
}) {
  const evidenceFor = (item: NotebookReport["items"][number]) =>
    report.examinedSources?.filter((s) =>
      item.sourceIds.includes(s.sourceId),
    ) || item.excerpts;
  return (
    <article className="jev-report">
      <header>
        <b>Review · {new Date(report.createdAt).toLocaleString()}</b>
      </header>
      <p>{report.sampledCoverage.note}</p>
      {report.stale && (
        <p role="status">
          Sources or cards changed since this review. Run it again before
          relying on these judgments.
        </p>
      )}
      {report.elapsedMs !== undefined && (
        <p className="fine-print">
          {(report.elapsedMs / 1000).toFixed(1)}s ·{" "}
          {report.usage?.input_tokens.toLocaleString()} input tokens ·{" "}
          {report.model}
        </p>
      )}
      {report.items.map((item) => (
        <div className="jev-item" key={item.id}>
          <div className="jev-item-title">
            <strong>{item.subject || item.kind}</strong>
            <span>
              {Math.round(item.confidence * 100)}% model estimate ·{" "}
              {item.status}
            </span>
          </div>
          <p className="jev-result-label">
            {item.dimension === "evidence"
              ? "Source support · "
              : item.dimension === "recall"
                ? "Recall design · "
                : ""}
            {item.status === "unresolved" ? "Needs review" : item.label}
          </p>
          {item.status === "unresolved" && (
            <p>
              Jev suggested “{item.label}”, but this result is uncertain. Check
              the excerpts before relying on it.
            </p>
          )}
          <p>{item.detail}</p>
          <details>
            <summary>Model estimates</summary>
            <p>{item.confidenceNote}</p>
            {item.probabilities && (
              <ul>
                {Object.entries(item.probabilities).map(
                  ([label, probability]) => (
                    <li key={label}>
                      {label.replaceAll("-", " ")}:{" "}
                      {Math.round(probability * 100)}%
                    </li>
                  ),
                )}
              </ul>
            )}
          </details>
          <details>
            <summary>Examined excerpts ({evidenceFor(item).length})</summary>
            {evidenceFor(item).map((e) => (
              <blockquote key={e.sourceId}>
                {"title" in e && (
                  <strong>
                    {String(e.title)}
                    <br />
                  </strong>
                )}
                {e.text}
              </blockquote>
            ))}
          </details>
          <div className="jev-feedback">
            <InkButton
              onClick={() => void onFeedback(report.id, item.id, "helpful")}
              disabled={!!feedbackBusy}
              aria-pressed={report.feedback[item.id] === "helpful"}
            >
              Helpful
            </InkButton>
            <InkButton
              onClick={() => void onFeedback(report.id, item.id, "not-helpful")}
              disabled={!!feedbackBusy}
              aria-pressed={report.feedback[item.id] === "not-helpful"}
            >
              Not helpful
            </InkButton>
          </div>
        </div>
      ))}
    </article>
  );
}
