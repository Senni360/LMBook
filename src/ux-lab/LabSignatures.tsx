import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  CornerUpLeft,
  Layers,
  X,
} from "lucide-react";
import {
  InkButton as Button,
  InkInput as Input,
  InkTextarea as Textarea,
} from "../components/InkControl";
import { confirmInk } from "../components/InkDialog";
import { useLab, directions } from "./state";
import type { Task } from "./types";

const id = () => crypto.randomUUID();
const paragraph = (text: string) =>
  text.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith("#")) || text;

export function LabSignature() {
  const { state, view, setView } = useLab();
  const direction = directions.find((d) => d.id === state.direction)!;
  return (
    <section
      className={`lab-signature ${view.signatureOpen ? "is-open" : ""}`}
      aria-label="Distinctive interaction"
    >
      <Button
        className="lab-signature-toggle"
        onClick={() => setView({ signatureOpen: !view.signatureOpen })}
        aria-expanded={view.signatureOpen}
      >
        <span>
          <span className="lab-small-label">Try this direction’s idea</span>
          <strong>{direction.signature}</strong>
        </span>
        <ChevronDown
          size={17}
          className={view.signatureOpen ? "rotated" : ""}
        />
      </Button>
      {view.signatureOpen && (
        <div className="lab-signature-body">
          {state.direction === 1 && <Alignment />}
          {state.direction === 2 && <ParkThought />}
          {state.direction === 3 && <Handoff />}
          {state.direction === 4 && <Margin />}
          {state.direction === 5 && <Detour />}
          {state.direction === 6 && <ClaimWorkbench />}
          {state.direction === 7 && <QuestionLens />}
          {state.direction === 8 && <WorkingSets />}
          {state.direction === 9 && <ChangeLens />}
          {state.direction === 10 && <ReadingPositions />}
        </div>
      )}
    </section>
  );
}

function Alignment() {
  const { state, view, setView, update, notify } = useLab();
  const proposal =
    view.proposal ??
    "In the pilot survey, 30% of participating households reported moving after the reservoir opened. The survey did not establish why they moved.";
  const claim = state.notes.find((n) => n.id === "claim")!;
  const baseRevision = view.proposalRevision ?? claim.revision;
  return (
    <>
      <p>
        Keep the claim, the examined source and a possible correction in view
        together.
      </p>
      <div className="lab-inline-actions">
        <Button
          onClick={() => {
            setView({
              compare: !view.compare,
              panel: "work",
              proposalRevision: view.proposalRevision ?? claim.revision,
            });
          }}
        >
          {view.compare ? "Exit comparison" : "Compare claim and evidence"}
        </Button>
        {view.compare && (
          <Button
            onClick={() =>
              setView({
                evidence: {
                  ...state.notes.find((n) => n.id === "methods-definitions")!,
                  title: "Survey scope and causality",
                },
                contextTab: "evidence",
              })
            }
          >
            Inspect the qualification
          </Button>
        )}
      </div>
      {view.compare && (
        <>
          <label>
            3 · Possible correction
            <Textarea
              aria-label="Possible correction"
              value={proposal}
              onChange={(e) =>
                setView({
                  proposal: e.target.value,
                  proposalRevision: baseRevision,
                })
              }
            />
          </label>
          <p className="lab-muted">
            Source 1 establishes a sample. Source 2 does not establish
            causality. This is a draft correction.
          </p>
          <Button
            disabled={claim.revision !== baseRevision || !!state.drafts.claim}
            onClick={() => {
              update((s) => ({
                ...s,
                drafts: {
                  ...s.drafts,
                  claim: s.notes
                    .find((n) => n.id === "claim")!
                    .text.replace(
                      "The reservoir displaced 30% of all households.",
                      proposal,
                    ),
                },
              }));
              notify(
                "Correction staged in the claim note. Save or revise it there.",
              );
            }}
          >
            Stage correction in note
          </Button>
          {(claim.revision !== baseRevision || !!state.drafts.claim) && (
            <p className="lab-warning">
              The note has changed or has a local draft. Inspect it before
              staging another correction.
            </p>
          )}
        </>
      )}
    </>
  );
}

function ParkThought() {
  const { state, view, setView, update, notify, storageError } = useLab();
  const title = view.pendingTitle || "";
  const setTitle = (pendingTitle: string) => setView({ pendingTitle });
  const note = state.notes.find((n) => n.id === view.noteId)!;
  return (
    <>
      <p>
        Put an unfinished question aside with its note, source selection and
        place.
      </p>
      <label>
        What would you like to come back to?
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Does this survey establish a cause?"
        />
      </label>
      <Button
        disabled={storageError}
        onClick={() => {
          update((s) => ({
            ...s,
            thoughts: [
              ...s.thoughts,
              {
                id: id(),
                title: title.trim() || s.question || note.title,
                noteId: note.id,
                task: view.task,
                sources: [...s.sourceIds],
                question: s.question,
                scroll: view.scroll,
                revision: note.revision,
              },
            ],
            question: "",
            views: { ...s.views, [s.direction]: { ...view, task: "home" } },
          }));
          setTitle("");
          notify("Thought parked. Your note draft is retained.");
        }}
      >
        <BookmarkPlus size={15} /> Park this thought
      </Button>
      <div className="lab-compact-list">
        {state.thoughts.map((t) => (
          <div key={t.id}>
            <span>
              <strong>{t.title}</strong>
              <small>
                {state.notes.find((n) => n.id === t.noteId)?.title ||
                  "Missing note"}
                {state.notes.find((n) => n.id === t.noteId)?.revision !==
                t.revision
                  ? " · changed since parking"
                  : ""}
              </small>
            </span>
            <Button
              onClick={async () => {
                if (
                  state.question &&
                  state.question !== t.question &&
                  !(await confirmInk(
                    "Your current question will be parked as another thought before the saved question is restored.",
                    "Restore parked question?",
                    "Park current and restore",
                  ))
                )
                  return;
                update((s) => ({
                  ...s,
                  thoughts:
                    s.question && s.question !== t.question
                      ? [
                          ...s.thoughts,
                          {
                            id: id(),
                            title: s.question,
                            noteId: view.noteId,
                            task: view.task,
                            sources: s.sourceIds,
                            question: s.question,
                            scroll: view.scroll,
                            revision: note.revision,
                          },
                        ]
                      : s.thoughts,
                  question: t.question,
                  sourceIds: t.sources.filter((n) =>
                    s.notes.some((x) => x.id === n),
                  ),
                  views: {
                    ...s.views,
                    [s.direction]: {
                      ...view,
                      noteId: s.notes.some((n) => n.id === t.noteId)
                        ? t.noteId
                        : view.noteId,
                      task: t.task,
                      scroll: t.scroll,
                    },
                  },
                }));
                notify(
                  "Restored the parked question and its selected sources.",
                );
              }}
            >
              Resume
            </Button>
            <Button
              aria-label={`Remove parked thought ${t.title}`}
              onClick={() =>
                update((s) => ({
                  ...s,
                  thoughts: s.thoughts.filter((x) => x.id !== t.id),
                }))
              }
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
      {!state.thoughts.length && (
        <p className="lab-muted">
          Parked thoughts stay here until you remove them. Their notes stay in
          the notebook.
        </p>
      )}
    </>
  );
}

function Handoff() {
  const { state, view, setView, update, navigate, notify } = useLab();
  const note = state.notes.find((n) => n.id === view.noteId)!;
  const h = view.handoff;
  return (
    <>
      <p>
        Carry a passage into another activity. Choose how its source joins the
        destination before using it.
      </p>
      {!h ? (
        <Button
          onClick={() =>
            setView({
              handoff: {
                noteId: note.id,
                text:
                  window.getSelection()?.toString().trim() ||
                  paragraph(state.drafts[note.id] ?? note.text),
                revision: note.revision,
              },
            })
          }
        >
          Carry a passage from {note.title}
        </Button>
      ) : (
        <>
          <blockquote>{h.text}</blockquote>
          <p className="lab-muted">
            {state.notes.find((n) => n.id === h.noteId)?.title} · revision{" "}
            {h.revision}
            {state.notes.find((n) => n.id === h.noteId)?.revision !== h.revision
              ? " · historical passage; source changed"
              : ""}
          </p>
          <div className="lab-inline-actions">
            {(
              [
                ["notes", "Notes"],
                ["ask", "Ask"],
                ["practice", "Practice"],
                ["listen", "Listen"],
              ] as [Task, string][]
            ).map(([task, label]) => (
              <Button
                key={task}
                aria-pressed={view.task === task}
                onClick={() => navigate(task)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="lab-inline-actions">
            <Button
              onClick={() => {
                update((s) => ({
                  ...s,
                  sourceIds: [h.noteId],
                  question: s.question || `Explain this passage: ${h.text}`,
                  views: {
                    ...s.views,
                    [s.direction]: { ...view, handoff: undefined, task: "ask" },
                  },
                }));
                notify(
                  "Prepared an editable question using this source. No request was sent.",
                );
              }}
            >
              Prepare question with this source
            </Button>
            <Button
              onClick={() => {
                update((s) => ({
                  ...s,
                  sourceIds: Array.from(new Set([...s.sourceIds, h.noteId])),
                }));
                notify(
                  "Source added for your next request. Existing answers are unchanged.",
                );
              }}
            >
              Add source to selection
            </Button>
            <Button onClick={() => setView({ handoff: undefined })}>
              Dismiss handoff
            </Button>
          </div>
          <p className="lab-muted">
            Saved decks and episodes keep their existing content. Use Create in
            the destination to prepare new material.
          </p>
        </>
      )}
    </>
  );
}

function Margin() {
  const { state, view, update, notify } = useLab();
  const note = state.notes.find((n) => n.id === view.noteId)!;
  const draft = state.margin;
  const target = state.notes.find((n) => n.id === draft?.noteId);
  const changed = draft && target?.revision !== draft.baseRevision;
  return (
    <>
      <p>
        Try different wording alongside the original. Only Apply changes the
        note.
      </p>
      {!draft ? (
        <Button
          onClick={() =>
            update((s) => ({
              ...s,
              margin: {
                noteId: note.id,
                base: note.text,
                baseRevision: note.revision,
                text: paragraph(note.text),
              },
            }))
          }
        >
          Try a revision of this paragraph
        </Button>
      ) : (
        <>
          <small>
            {target?.title || "Missing original note"} · base revision{" "}
            {draft.baseRevision}
          </small>
          <div className="lab-comparison">
            <div>
              <span className="lab-small-label">Original paragraph</span>
              <blockquote>{paragraph(draft.base)}</blockquote>
            </div>
            <label>
              Editable alternative
              <Textarea
                value={draft.text}
                onChange={(e) =>
                  update((s) => ({
                    ...s,
                    margin: s.margin
                      ? { ...s.margin, text: e.target.value }
                      : undefined,
                  }))
                }
              />
            </label>
          </div>
          {changed && (
            <div className="lab-warning">
              <strong>The original changed.</strong>
              <p>
                Current text: {paragraph(target?.text || "Source unavailable")}
              </p>
              <Button
                onClick={() => {
                  if (target)
                    update((s) => ({
                      ...s,
                      margin: {
                        ...draft,
                        base: target.text,
                        baseRevision: target.revision,
                      },
                    }));
                }}
              >
                Use current text as new base
              </Button>
            </div>
          )}
          <div className="lab-inline-actions">
            <Button
              disabled={
                !!changed ||
                !target ||
                !!state.drafts[draft.noteId] ||
                state.saveFailure
              }
              onClick={() => {
                update((s) => ({
                  ...s,
                  notes: s.notes.map((n) =>
                    n.id === draft.noteId
                      ? {
                          ...n,
                          text: n.text.replace(
                            paragraph(draft.base),
                            draft.text,
                          ),
                          revision: n.revision + 1,
                        }
                      : n,
                  ),
                  history: [
                    {
                      id: id(),
                      text: `Applied margin draft to ${target?.title}`,
                      time: new Date().toISOString(),
                    },
                    ...s.history,
                  ],
                  changedIds: Array.from(
                    new Set([...s.changedIds, draft.noteId]),
                  ),
                  margin: undefined,
                  suggestions: [
                    ...s.suggestions,
                    {
                      id: id(),
                      title: "Margin revision",
                      noteId: draft.noteId,
                      detail: "Your staged paragraph revision",
                      quote: paragraph(draft.base),
                      addition: draft.text,
                      before: paragraph(draft.base),
                      replacement: true,
                      baseRevision: draft.baseRevision,
                      status: "applied",
                    },
                  ],
                }));
                notify("Revision applied. Undo is available in Review.");
              }}
            >
              Apply revision
            </Button>
            <Button
              onClick={() =>
                notify(
                  "Alternative saved locally. Close this panel and return whenever you like.",
                )
              }
            >
              Keep for later
            </Button>
            <Button
              onClick={async () => {
                if (
                  await confirmInk(
                    "The live note will stay unchanged.",
                    "Discard alternative?",
                    "Discard alternative",
                  )
                )
                  update((s) => ({ ...s, margin: undefined }));
              }}
            >
              Discard alternative
            </Button>
          </div>
          {!!state.drafts[draft.noteId] && (
            <p className="lab-warning">
              Save or resolve your note draft first. The margin alternative is
              retained.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Detour() {
  const { state, view, update, openNote, navigate, notify } = useLab();
  const start = (help: string) =>
    update((s) => ({
      ...s,
      detour: {
        task: view.task,
        noteId: view.noteId,
        seconds: s.audio.seconds,
        playing: s.audio.playing,
        help,
      },
      audio: { ...s.audio, playing: false },
    }));
  return (
    <>
      <p>
        A short side path. Your current answer and playback position remain
        exactly where you left them.
      </p>
      {!state.detour ? (
        <div className="lab-inline-actions">
          <Button onClick={() => start("source")}>Inspect a source</Button>
          <Button onClick={() => start("term")}>Explain a term</Button>
          <Button onClick={() => start("example")}>Try one example</Button>
        </div>
      ) : (
        <>
          <div className="lab-detour">
            <span className="lab-small-label">Your detour</span>
            <h3>
              {state.detour.help === "source"
                ? "What did the survey actually measure?"
                : state.detour.help === "term"
                  ? "Reported moving and displacement"
                  : "A question to try"}
            </h3>
            <p>
              {state.detour.help === "example"
                ? "If 12 of 40 surveyed households moved, what population does the 30% describe? Think about the people who were not surveyed."
                : "The passage describes participating households. It does not say that all households were surveyed, or that the reservoir caused them to move."}
            </p>
            <Button
              onClick={() => {
                openNote("survey");
                navigate("notes");
              }}
            >
              Read the survey note
            </Button>
            <small>
              Illustrative help prepared for this prototype. No AI request.
            </small>
          </div>
          <Button
            onClick={() => {
              const d = state.detour!;
              update((s) => ({
                ...s,
                audio: { ...s.audio, seconds: d.seconds, playing: d.playing },
                views: {
                  ...s.views,
                  [s.direction]: { ...view, task: d.task, noteId: d.noteId },
                },
                detour: undefined,
              }));
              notify(
                "Back where you left off. No practice result was recorded for the detour.",
              );
            }}
          >
            <CornerUpLeft size={15} /> Return to{" "}
            {state.detour.task === "listen"
              ? `${Math.floor(state.detour.seconds / 60)}:${String(Math.floor(state.detour.seconds % 60)).padStart(2, "0")}`
              : state.detour.task === "practice"
                ? `card ${state.practice.index + 1}`
                : "your activity"}
          </Button>
        </>
      )}
    </>
  );
}

function ClaimWorkbench() {
  const { state, update, notify } = useLab();
  const choices = state.notes.filter((n) =>
    [
      "survey",
      "methods-definitions",
      "relocation",
      "findings-definitions",
    ].includes(n.id),
  );
  const c = state.claim;
  return (
    <>
      <p>
        Arrange what supports your claim and what limits it. Empty areas do not
        prove that no limitations exist.
      </p>
      <label>
        Your claim
        <Textarea
          aria-label="Your claim"
          value={c.text}
          onChange={(e) =>
            update((s) => ({
              ...s,
              claim: { ...s.claim, text: e.target.value },
            }))
          }
        />
      </label>
      <div className="lab-evidence-roles">
        {choices.map((n) => (
          <article key={n.id}>
            <strong>{n.title}</strong>
            <small className="lab-muted">{n.path}</small>
            <p>{paragraph(n.text)}</p>
            <div className="lab-inline-actions">
              <Button
                aria-pressed={c.supports.includes(n.id)}
                onClick={() =>
                  update((s) => ({
                    ...s,
                    claim: {
                      ...s.claim,
                      supports: s.claim.supports.includes(n.id)
                        ? s.claim.supports.filter((x) => x !== n.id)
                        : [...s.claim.supports, n.id],
                      limits: s.claim.limits.filter((x) => x !== n.id),
                    },
                  }))
                }
              >
                Supports this
              </Button>
              <Button
                aria-pressed={c.limits.includes(n.id)}
                onClick={() =>
                  update((s) => ({
                    ...s,
                    claim: {
                      ...s.claim,
                      limits: s.claim.limits.includes(n.id)
                        ? s.claim.limits.filter((x) => x !== n.id)
                        : [...s.claim.limits, n.id],
                      supports: s.claim.supports.filter((x) => x !== n.id),
                    },
                  }))
                }
              >
                Limits this
              </Button>
            </div>
          </article>
        ))}
      </div>
      <label>
        Still unresolved
        <Input
          value={c.unresolved}
          onChange={(e) =>
            update((s) => ({
              ...s,
              claim: { ...s.claim, unresolved: e.target.value },
            }))
          }
          placeholder="What would establish why people moved?"
        />
      </label>
      <Button
        disabled={!c.text.trim()}
        onClick={() => {
          const note = state.notes.find((n) => n.id === "claim")!;
          update((s) => ({
            ...s,
            drafts: {
              ...s.drafts,
              claim: `${s.drafts.claim ?? note.text}\n\n## Working argument\n\n${c.text}\n\n${[...c.supports, ...c.limits].map((n) => `- [[${s.notes.find((x) => x.id === n)?.path}]] (${c.supports.includes(n) ? "support" : "qualification"})`).join("\n")}\n\nUnresolved: ${c.unresolved || "None recorded; not a finding of completeness."}`,
            },
            views: {
              ...s.views,
              [s.direction]: { ...viewFor(s), task: "notes", noteId: "claim" },
            },
          }));
          notify(
            "Argument and source references inserted into the note draft. Save when ready.",
          );
        }}
      >
        Insert into working note
      </Button>
    </>
  );
}
function viewFor(s: import("./types").LabState) {
  return s.views[s.direction];
}

const questions = [
  {
    title: "Who was represented in the survey?",
    notes: ["survey", "methods-definitions"],
  },
  {
    title: "What can the evidence explain?",
    notes: ["relocation", "claim", "findings-definitions"],
  },
  {
    title: "Which definitions differ?",
    notes: ["methods-definitions", "findings-definitions"],
  },
  { title: "What remains unanswered?", notes: ["open-questions"] },
];
function QuestionLens() {
  const { view, setView, state, openNote } = useLab();
  const q = questions.find((q) => q.title === view.selectedQuestion);
  return (
    <>
      <p>
        Navigate the same notes through questions. Files and topic organisation
        stay in place.
      </p>
      <Button
        aria-pressed={view.questionLens}
        onClick={() => setView({ questionLens: !view.questionLens })}
      >
        {view.questionLens ? "Return to topic outline" : "View by questions"}
      </Button>
      {view.questionLens && (
        <div className="lab-question-lens">
          {questions.map((q) => (
            <Button
              key={q.title}
              aria-pressed={q.title === view.selectedQuestion}
              onClick={() => setView({ selectedQuestion: q.title })}
            >
              {q.title}
            </Button>
          ))}
          {q && (
            <div>
              <h3>{q.title}</h3>
              {q.notes.map((n) => (
                <Button key={n} onClick={() => openNote(n)}>
                  {state.notes.find((x) => x.id === n)?.title}
                  <small className="lab-muted">
                    {state.notes.find((x) => x.id === n)?.path}
                  </small>
                </Button>
              ))}
              <p className="lab-muted">
                These are authored example relationships, not AI-verified
                answers.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function WorkingSets() {
  const { state, view, setView, update, notify, storageError } = useLab();
  const title = view.pendingTitle || "";
  const setTitle = (pendingTitle: string) => setView({ pendingTitle });
  const readLayout = () => {
    try {
      return localStorage.getItem("lmbook-ux-lab-layout-8") || undefined;
    } catch {
      return undefined;
    }
  };
  return (
    <>
      <p>
        Close a line of work as one bundle. Restore the arrangement later using
        the latest files.
      </p>
      <label>
        Working set name
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Compare relocation evidence"
        />
      </label>
      <p className="lab-muted">
        Includes {view.tabs.length} open items, this activity and reading
        position. Local drafts remain saved separately.
      </p>
      <Button
        disabled={!view.tabs.length || storageError}
        onClick={() => {
          update((s) => ({
            ...s,
            workingSets: [
              ...s.workingSets,
              {
                id: id(),
                title: title.trim() || "Relocation evidence",
                view: { ...view },
                layout: readLayout(),
                revisions: Object.fromEntries(
                  s.notes
                    .filter((n) => view.tabs.includes(n.id))
                    .map((n) => [n.id, n.revision]),
                ),
              },
            ],
            views: {
              ...s.views,
              [s.direction]: { ...view, tabs: [], task: "home" },
            },
          }));
          setTitle("");
          notify("Working set put away. Files and drafts were not changed.");
        }}
      >
        <Layers size={15} /> Put this working set away
      </Button>
      <div className="lab-compact-list">
        {state.workingSets.map((w) => (
          <div key={w.id}>
            <span>
              <strong>{w.title}</strong>
              <small>
                {w.view.tabs.length} items ·{" "}
                {Object.entries(w.revisions).some(
                  ([id, revision]) =>
                    state.notes.find((n) => n.id === id)?.revision !== revision,
                )
                  ? "files changed since saved"
                  : "current files available"}
              </small>
            </span>
            <Button
              onClick={() => {
                if (w.layout) {
                  try {
                    localStorage.setItem("lmbook-ux-lab-layout-8", w.layout);
                    window.dispatchEvent(
                      new Event("lmbook-ux-lab-restore-layout"),
                    );
                  } catch {}
                }
                update((s) => ({
                  ...s,
                  views: {
                    ...s.views,
                    [s.direction]: {
                      ...w.view,
                      tabs: [...new Set([...view.tabs, ...w.view.tabs])],
                      signatureOpen: true,
                    },
                  },
                }));
                notify(
                  "Working arrangement restored with current files. No generation was restarted.",
                );
              }}
            >
              Restore
            </Button>
            <Button
              aria-label={`Remove working set ${w.title}`}
              onClick={() =>
                update((s) => ({
                  ...s,
                  workingSets: s.workingSets.filter((x) => x.id !== w.id),
                }))
              }
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

function ChangeLens() {
  const { state, view, setView, update, openNote } = useLab();
  return (
    <>
      <p>
        See meaningful changes in context. Marking them seen never approves a
        suggestion.
      </p>
      <Button
        aria-pressed={view.compare}
        onClick={() => setView({ compare: !view.compare, task: "home" })}
      >
        {view.compare ? "Exit changes view" : "What changed?"}
      </Button>
      {view.compare && (
        <>
          <p className="lab-muted">
            Since {new Date(state.seenAt).toLocaleString()}
          </p>
          <div className="lab-compact-list">
            {state.changedIds.map((id) => (
              <div key={id}>
                <span>
                  <strong>
                    {state.notes.find((n) => n.id === id)?.title ||
                      "Unavailable note"}
                  </strong>
                  <small>
                    Current source changed. Earlier answers keep their examined
                    snapshot.
                  </small>
                </span>
                <Button onClick={() => openNote(id)}>Inspect</Button>
              </div>
            ))}
          </div>
          {!state.changedIds.length && (
            <p>
              No source changes since your baseline. Pending suggestions remain
              in Review.
            </p>
          )}
          <p>
            {
              state.suggestions.filter(
                (s) => s.status === "pending" || s.status === "stale",
              ).length
            }{" "}
            decisions remain in Review.
          </p>
          <Button
            onClick={() =>
              update((s) => ({
                ...s,
                changedIds: [],
                seenAt: new Date().toISOString(),
              }))
            }
          >
            <Check size={15} /> Mark changes seen
          </Button>
        </>
      )}
    </>
  );
}

function ReadingPositions() {
  const { state, view, setView, openNote, notify } = useLab();
  const note = state.notes.find((n) => n.id === view.noteId)!;
  const a = view.anchor;
  return (
    <>
      <p>
        Explore freely while keeping the passage your learning activity is
        about.
      </p>
      <div className="lab-two-positions">
        <div>
          <span className="lab-small-label">You’re reading</span>
          <strong>{note.title}</strong>
          <Button
            onClick={() => {
              setView({
                anchor: {
                  noteId: note.id,
                  scroll: view.scroll,
                  text:
                    window.getSelection()?.toString().trim() ||
                    paragraph(note.text),
                  revision: note.revision,
                },
              });
              notify(
                "Learning passage pinned. Existing answers and recordings are unchanged.",
              );
            }}
          >
            Use this passage as anchor
          </Button>
        </div>
        <div>
          <span className="lab-small-label">Learning passage</span>
          {a ? (
            <>
              <strong>
                {state.notes.find((n) => n.id === a.noteId)?.title ||
                  "Historical source"}
              </strong>
              <blockquote>{a.text}</blockquote>
              <small>
                Revision {a.revision}
                {state.notes.find((n) => n.id === a.noteId)?.revision !==
                a.revision
                  ? " · source changed; this is your earlier excerpt"
                  : ""}
              </small>
              <Button
                onClick={() => {
                  if (state.notes.some((n) => n.id === a.noteId)) {
                    openNote(a.noteId);
                    setView({
                      task: view.task,
                      panel: "material",
                      scroll: a.scroll || 0,
                    });
                  }
                }}
              >
                <CornerUpLeft size={14} /> Return to learning passage
              </Button>
            </>
          ) : (
            <p className="lab-muted">
              Choose a passage to keep in view while you explore.
            </p>
          )}
        </div>
      </div>
      <p className="lab-muted">
        The activity’s source picker controls AI access. This anchor is a
        reading aid and never silently changes that selection.
      </p>
    </>
  );
}
