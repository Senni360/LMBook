import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  type ReactNode,
  type Ref,
} from "react";
import ReactMarkdown from "react-markdown";
import { confirmInk } from "../components/InkDialog";
import {
  InkButton,
  InkInput,
  InkSelect,
  InkTextarea,
} from "../components/InkControl";
import { useLab } from "./state";
import type { LabNote, Pair, Suggestion, Task } from "./types";
import "./lab-screens.css";

export type SharedScreenProps = {
  onSignature?: () => void;
  onImport?: () => void;
  onSettings?: () => void;
};

function ScreenFrame({
  title,
  eyebrow,
  children,
  actions,
  scrollRef,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
  scrollRef?: Ref<HTMLElement>;
}) {
  return (
    <section className="ux-screen" ref={scrollRef}>
      <div className="ux-screen-heading">
        <div>
          <p className="ux-eyebrow">{eyebrow || "LMBook studio"}</p>
          <h1>{title}</h1>
        </div>
        {actions && <div className="ux-screen-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function allNotes(notes: LabNote[]) {
  return notes;
}
function noteById(notes: LabNote[], id?: string) {
  return notes.find((note) => note.id === id) || notes[0];
}
function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function MaterialBrowser({
  onImport,
  onSettings,
  mode,
}: SharedScreenProps & { mode?: "notes" | "sources" }) {
  const { state, view, openNote, navigate, setView, update, notify } = useLab();
  const searchId = useId();
  const [query, setQuery] = useState(view.filter || "");
  const [limit, setLimit] = useState(30);
  const [sourceMode, setShowSources] = useState(false);
  const showSources = mode ? mode === "sources" : sourceMode;
  const notes = useMemo(() => allNotes(state.notes), [state.notes]);
  const collection = state.collections?.find(
    (item) => item.id === state.activeCollection,
  );
  const scopedNotes = collection?.noteIds
    ? notes.filter((note) => collection.noteIds.includes(note.id))
    : notes;
  const results = useMemo(
    () =>
      scopedNotes.filter(
        (note) =>
          note.source === showSources &&
          `${note.title} ${note.path} ${note.topic}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [scopedNotes, query, showSources],
  );
  const visible = results.slice(0, limit);
  const selected = new Set(state.sourceIds);
  const toggleSource = (id: string) =>
    update((current) => ({
      ...current,
      sourceIds: current.sourceIds.includes(id)
        ? current.sourceIds.filter((sourceId) => sourceId !== id)
        : [...current.sourceIds, id],
    }));
  const createNote = () => {
    const id = `note-${Date.now()}`;
    update((current) => ({
      ...current,
      notes: [
        {
          id,
          path: `06 Notes/New note ${current.notes.length + 1}.md`,
          title: "New note",
          text: "# New note\n\nStart writing here.",
          revision: 1,
          topic: "notes",
          source: false,
        },
        ...current.notes,
      ],
      collections: current.collections?.map((item) =>
        item.id === current.activeCollection
          ? { ...item, noteIds: [...item.noteIds, id] }
          : item,
      ),
    }));
    navigate("notes");
    openNote(id);
  };
  const openMaterial = (id: string) => {
    openNote(id);
    if (state.direction !== 10) navigate("notes");
  };
  return (
    <aside className="ux-material" aria-label="Material browser">
      <div className="ux-material-top">
        <label className="ux-label" htmlFor={searchId}>
          Find material
        </label>
        <InkInput
          id={searchId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setView({ filter: event.target.value });
            setLimit(30);
          }}
          placeholder="Search titles and paths"
        />
      </div>
      <div className="ux-material-actions">
        <InkButton type="button" onClick={onImport}>
          + Import
        </InkButton>
        <InkButton type="button" onClick={createNote}>
          New note
        </InkButton>
      </div>
      {!mode && (
        <div
          className="ux-material-switch"
          role="tablist"
          aria-label="Material type"
        >
          <button
            type="button"
            className={!showSources ? "is-active" : ""}
            onClick={() => {
              setShowSources(false);
              setLimit(30);
            }}
          >
            Notes
          </button>
          <button
            type="button"
            className={showSources ? "is-active" : ""}
            onClick={() => {
              setShowSources(true);
              setLimit(30);
            }}
          >
            Sources
          </button>
        </div>
      )}
      <p className="ux-material-count">
        {results.length} results · {selected.size} selected for Ask
      </p>
      <div className="ux-material-list" role="list">
        {visible.map((note) => (
          <div
            className={`ux-material-row ${note.id === view.noteId ? "is-current" : ""}`}
            key={note.id}
            role="listitem"
          >
            <label className="ux-check">
              <input
                aria-label={`Select ${note.title} for Ask`}
                type="checkbox"
                checked={selected.has(note.id)}
                onChange={() => toggleSource(note.id)}
              />
              <span aria-hidden="true" />
            </label>
            <button
              type="button"
              className="ux-material-open"
              onClick={() => openMaterial(note.id)}
            >
              <strong>{note.title}</strong>
              <small>{note.path}</small>
            </button>
          </div>
        ))}
      </div>
      {limit < results.length && (
        <InkButton
          type="button"
          className="ux-more"
          onClick={() => setLimit((current) => current + 30)}
        >
          Show 30 more
        </InkButton>
      )}
      <button type="button" className="ux-subtle-link" onClick={onSettings}>
        Notebook settings
      </button>
    </aside>
  );
}

export function NoteScreen({
  noteId,
  readonly = false,
  onSignature,
}: SharedScreenProps & { noteId?: string; readonly?: boolean }) {
  const { state, view, update, saveNote, setView, notify } = useLab();
  const note = noteById(state.notes, noteId || view.noteId);
  const [editing, setEditing] = useState(!readonly && !!state.drafts[note.id]);
  const draftText = state.drafts[note.id];
  const scrollRef = useRef<HTMLElement>(null);
  const currentView = useRef(view);
  currentView.current = view;
  useEffect(() => {
    if (note.id !== currentView.current.noteId) return;
    let parent = scrollRef.current?.parentElement;
    while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY))
      parent = parent.parentElement;
    const target = parent || window;
    const frame = requestAnimationFrame(() => {
      if (parent) parent.scrollTop = currentView.current.scroll;
      else window.scrollTo(0, currentView.current.scroll);
    });
    const remember = () =>
      setView({ scroll: parent ? parent.scrollTop : window.scrollY });
    target.addEventListener("scroll", remember, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", remember);
    };
  }, [note.id, state.direction, readonly]);
  const text = readonly ? note.text : (draftText ?? note.text);
  useEffect(() => {
    setEditing(!readonly && !!state.drafts[note.id]);
  }, [note.id, readonly, draftText !== undefined]);
  if (!note)
    return (
      <ScreenFrame title="No note selected">
        <p>Select a note from Material.</p>
      </ScreenFrame>
    );
  const dirty = text !== note.text;
  const externalChange =
    !readonly &&
    draftText !== undefined &&
    state.draftBases?.[note.id] !== undefined &&
    state.draftBases[note.id] !== note.revision;
  const save = () => {
    const ok = saveNote(note.id);
    notify(
      ok ? "Draft saved locally." : "Save failed. Your draft is recoverable.",
    );
  };
  const keepDraftAsNew = () => {
    const id = `note-recovery-${Date.now()}`;
    update((current) => ({
      ...current,
      notes: [
        {
          id,
          path: `06 Notes/Recovered ${note.title}.md`,
          title: `Recovered ${note.title}`,
          text,
          revision: 1,
          topic: note.topic,
          source: false,
        },
        ...current.notes,
      ],
      drafts: { ...current.drafts, [id]: text },
    }));
    notify("Draft retained as a new note for review.");
  };
  return (
    <ScreenFrame
      title={note.title}
      scrollRef={scrollRef}
      eyebrow={note.path}
      actions={
        <>
          {!readonly && (
            <InkButton
              type="button"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Read note" : "Edit note"}
            </InkButton>
          )}
          {!readonly && editing && (
            <InkButton type="button" onClick={save}>
              Save{dirty ? " *" : ""}
            </InkButton>
          )}
        </>
      }
    >
      <div className="ux-note-meta">
        <span>Revision {note.revision}</span>
        <span>{note.source ? "Source snapshot" : "Authored note"}</span>
        {externalChange && (
          <span className="ux-warning">External change parked for review</span>
        )}
        {state.saveFailure && (
          <span className="ux-warning">Save needs attention</span>
        )}
      </div>
      {externalChange && (
        <div className="ux-recovery">
          <strong>Draft recovery</strong>
          <span>Review the parked draft against the current note.</span>
          <details>
            <summary>Inspect the current external version</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{note.text}</pre>
          </details>
          <InkButton
            type="button"
            onClick={async () => {
              if (
                !(await confirmInk(
                  "The current source will remain. Your local draft will be discarded; use Keep draft as new note if you want both.",
                  "Use current source?",
                  "Discard local draft",
                ))
              )
                return;
              update((current) => ({
                ...current,
                drafts: Object.fromEntries(
                  Object.entries(current.drafts).filter(
                    ([id]) => id !== note.id,
                  ),
                ),
              }));
            }}
          >
            Use current
          </InkButton>
          <InkButton type="button" onClick={keepDraftAsNew}>
            Keep draft as new note
          </InkButton>
          <InkButton
            disabled={state.saveFailure}
            onClick={() => {
              update((current) => ({
                ...current,
                notes: current.notes.map((n) =>
                  n.id === note.id && n.revision === note.revision
                    ? { ...n, text, revision: n.revision + 1 }
                    : n,
                ),
                drafts: Object.fromEntries(
                  Object.entries(current.drafts).filter(
                    ([id]) => id !== note.id,
                  ),
                ),
                changedIds: [...new Set([...current.changedIds, note.id])],
              }));
              notify("Reviewed draft applied to the demo note.");
            }}
          >
            Apply reviewed draft
          </InkButton>
        </div>
      )}
      {editing ? (
        <InkTextarea
          aria-label="Note markdown"
          className="ux-note-editor"
          value={text}
          onChange={(event) =>
            update((current) => ({
              ...current,
              drafts: { ...current.drafts, [note.id]: event.target.value },
            }))
          }
        />
      ) : (
        <article className="ux-markdown">
          <ReactMarkdown>{text}</ReactMarkdown>
        </article>
      )}
      <div className="ux-note-footer">
        <InkButton
          type="button"
          onClick={() =>
            setView({
              panel: "context",
              contextTab: "evidence",
              evidence: {
                id: note.id,
                title: note.title,
                text: note.text,
                revision: note.revision,
              },
            })
          }
        >
          Open evidence
        </InkButton>
        <InkButton type="button" onClick={onSignature}>
          Explore this workflow
        </InkButton>
      </div>
    </ScreenFrame>
  );
}

function SourcePicker() {
  const { state, update } = useLab();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selected = new Set(state.sourceIds);
  const notes = state.notes.filter(
    (note) =>
      (note.source || selected.has(note.id)) &&
      `${note.title} ${note.path}`.toLowerCase().includes(query.toLowerCase()),
  );
  const setSources = (ids: string[]) =>
    update((current) => ({ ...current, sourceIds: ids }));
  const visible = expanded ? notes : notes.slice(0, 12);
  return (
    <details className="ux-source-picker">
      <summary className="ux-source-picker-head">
        <strong>Evidence scope</strong>
        <span>{selected.size} selected · note snapshots</span>
      </summary>
      <div>
        <InkButton
          type="button"
          onClick={() =>
            setSources(
              state.notes.filter((note) => note.source).map((note) => note.id),
            )
          }
        >
          Select all
        </InkButton>
        <InkButton type="button" onClick={() => setSources([])}>
          Clear
        </InkButton>
      </div>
      <label className="ux-label" htmlFor="ask-source-search">
        Find a source
      </label>
      <InkInput
        id="ask-source-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search source names"
      />
      {visible.map((note) => (
        <label className="ux-source-row" key={note.id}>
          <input
            aria-label={`Select ${note.title} as evidence`}
            type="checkbox"
            checked={selected.has(note.id)}
            onChange={() => {
              const next = new Set(selected);
              next.has(note.id) ? next.delete(note.id) : next.add(note.id);
              setSources([...next]);
            }}
          />
          <span>
            <strong>{note.title}</strong>
            <small>{note.path}</small>
          </span>
        </label>
      ))}
      {notes.length > 12 && (
        <InkButton type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer sources" : `Show all ${notes.length} sources`}
        </InkButton>
      )}
    </details>
  );
}

export function AskScreen() {
  const { state, update, notify, setView } = useLab();
  const pending = !!state.askRun;
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.direction !== 11) return;
    const frame = requestAnimationFrame(() => {
      const list = messagesRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [state.messages.length, state.direction]);
  const selected = state.notes.filter((note) =>
    state.sourceIds.includes(note.id),
  );
  const ask = () => {
    if (pending) return;
    const question = state.question.trim();
    if (!question) {
      notify("Write a question before asking.");
      return;
    }
    if (state.providerFailure) {
      notify("Provider unavailable. The question was kept as a draft.");
      return;
    }
    if (!selected.length) {
      notify("Select at least one source snapshot first.");
      return;
    }
    const snapshots = selected.map((note) => ({
      id: note.id,
      title: note.title,
      text: note.text,
      revision: note.revision,
    }));
    const hasSurvey = snapshots.some((source) =>
      /12 of 40 participating households/i.test(source.text),
    );
    const hasMethods = snapshots.some((source) =>
      /method|why|cause|establish/i.test(`${source.title} ${source.text}`),
    );
    const answer = hasSurvey
      ? `The selected survey passage reports that 12 of 40 participating households moved after the reservoir opened.${hasMethods ? " The accompanying qualification says the survey did not establish why they moved." : " The selected sources do not establish why they moved."}`
      : "The selected sources do not contain the survey passage needed to answer this question.";
    update((current) => ({
      ...current,
      askRun: { id: crypto.randomUUID(), question, answer, sources: snapshots },
    }));
  };
  const cancel = () => {
    update((current) => ({ ...current, askRun: undefined }));
    notify("Question cancelled; no answer was added.");
  };
  return (
    <ScreenFrame
      title="Ask from your sources"
      eyebrow="Work · source-grounded question"
    >
      <SourcePicker />
      <div className="ux-ask-composer">
        <label className="ux-label" htmlFor="ask-question">
          Question
        </label>
        <InkTextarea
          id="ask-question"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !pending
            ) {
              event.preventDefault();
              ask();
            }
          }}
          value={state.question || ""}
          onChange={(event) =>
            update((current) => ({ ...current, question: event.target.value }))
          }
          placeholder="Ask about the selected snapshots"
        />{" "}
        <div className="ux-composer-actions">
          {pending ? (
            <InkButton type="button" onClick={cancel}>
              Cancel
            </InkButton>
          ) : (
            <InkButton type="button" onClick={ask}>
              {state.direction === 11 ? "Send question" : "Ask Luna"}
            </InkButton>
          )}
          <span>Deterministic demo · no live provider call</span>
        </div>
      </div>
      {state.providerFailure && (
        <p className="ux-warning">
          Provider unavailable. Your selected sources and draft remain
          available; no answer will be added.
        </p>
      )}
      <div className="ux-message-list" ref={messagesRef}>
        {state.messages.map((message) => (
          <article className="ux-message" key={message.id}>
            <p className="ux-question">{message.question}</p>
            <p>{message.answer}</p>
            <div className="ux-citation-row">
              {message.sources.map((source) => (
                <button
                  type="button"
                  key={source.id}
                  onClick={() =>
                    setView({
                      panel: "context",
                      contextTab: "evidence",
                      evidence: source,
                    })
                  }
                >
                  {source.title} · rev {source.revision}
                </button>
              ))}
            </div>
            <p className="ux-qualification">
              Qualification: this answer describes the examined snapshots and
              should not be read as a causal or population-wide claim.
            </p>
          </article>
        ))}
      </div>
    </ScreenFrame>
  );
}

const fixturePairs: Pair[] = [
  ["die Entscheidung", "de beslissing"],
  ["die Erfahrung", "de ervaring"],
  ["der Unterschied", "het verschil"],
  ["die Voraussetzung", "de voorwaarde"],
  ["der Zusammenhang", "het verband"],
  ["die Entwicklung", "de ontwikkeling"],
  ["die Ursache", "de oorzaak"],
  ["die Folge", "het gevolg"],
  ["die Maßnahme", "de maatregel"],
  ["die Möglichkeit", "de mogelijkheid"],
  ["der Vergleich", "de vergelijking"],
  ["die Auswirkung", "het effect"],
].map(([german, dutch], index) => ({
  id: `pair-${index + 1}`,
  german,
  dutch,
  reviewed: index !== 7,
  generated: index === 11,
}));

export function PracticeScreen() {
  const { state, update, notify } = useLab();
  const practice = state.practice;
  const pair =
    state.pairs[practice.index] ||
    fixturePairs[practice.index] ||
    fixturePairs[0];
  const deck = state.pairs.length ? state.pairs : fixturePairs;
  const practiceRef = useRef<HTMLDivElement>(null);
  const setPractice = (patch: Partial<typeof practice>) =>
    update((current) => ({
      ...current,
      practice: { ...current.practice, ...patch },
    }));
  const handlePracticeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      update((current) => ({
        ...current,
        practice: {
          ...current.practice,
          index:
            (current.practice.index +
              (event.key === "ArrowRight" ? 1 : deck.length - 1)) %
            deck.length,
          revealed: false,
          answer: "",
          feedback: "",
        },
      }));
    }
    if (event.key === " ") {
      event.preventDefault();
      update((current) => ({
        ...current,
        practice: { ...current.practice, revealed: !current.practice.revealed },
      }));
    }
  };
  useEffect(() => {
    let frame = 0;
    let previous = false;
    const poll = () => {
      const focused =
        practiceRef.current && document.activeElement === practiceRef.current;
      const pad = focused ? navigator.getGamepads?.()[0] : undefined;
      const reveal = Boolean(pad?.buttons?.[0]?.pressed);
      const next = Boolean(pad?.buttons?.[1]?.pressed);
      if (reveal && !previous)
        update((current) => ({
          ...current,
          practice: {
            ...current.practice,
            revealed: !current.practice.revealed,
          },
        }));
      if (next && !previous) {
        update((current) => ({
          ...current,
          practice: {
            ...current.practice,
            index: (current.practice.index + 1) % deck.length,
            revealed: false,
            answer: "",
            feedback: "",
          },
        }));
      }
      previous = reveal || next;
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [deck.length]);
  const answer = practice.reverse ? pair.german : pair.dutch;
  const prompt = practice.reverse ? pair.dutch : pair.german;
  return (
    <ScreenFrame
      title="Practice deck"
      eyebrow="Duits · twelve editable pairs"
      actions={
        <>
          <InkSelect
            aria-label="Practice direction"
            value={practice.reverse ? "reverse" : "forward"}
            onChange={(event) =>
              setPractice({
                reverse: event.target.value === "reverse",
                revealed: false,
                answer: "",
                feedback: "",
              })
            }
          >
            <option value="forward">German → Dutch</option>
            <option value="reverse">Dutch → German</option>
          </InkSelect>
          <InkSelect
            aria-label="Practice format"
            value={practice.typing ? "typing" : "flip"}
            onChange={(event) =>
              setPractice({
                typing: event.target.value === "typing",
                revealed: false,
                answer: "",
                feedback: "",
              })
            }
          >
            <option value="flip">Flip cards</option>
            <option value="typing">Typing</option>
          </InkSelect>
        </>
      }
    >
      <p className="ux-incomplete">
        Review status:{" "}
        {deck.filter((item) => !item.reviewed).length
          ? "incomplete source review"
          : "reviewed"}
        . Generated translations stay marked.
      </p>
      <div
        className="ux-practice-card"
        ref={practiceRef}
        tabIndex={0}
        onKeyDown={handlePracticeKey}
        aria-label="Practice card"
      >
        <span className="ux-card-count">
          {practice.index + 1} / {deck.length}
        </span>
        <p className="ux-card-prompt">{prompt}</p>
        {practice.typing ? (
          <div>
            <label className="ux-label" htmlFor="practice-answer">
              Your answer
            </label>
            <InkInput
              id="practice-answer"
              value={practice.answer}
              onChange={(event) => {
                setPractice({ answer: event.target.value, feedback: "" });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  setPractice({
                    revealed: true,
                    answer: practice.answer,
                    feedback:
                      practice.answer.trim().toLowerCase() ===
                      answer.toLowerCase()
                        ? "Correct"
                        : `Expected: ${answer}`,
                  });
              }}
            />
            {practice.revealed && (
              <p
                className={
                  practice.feedback === "Correct" ? "ux-correct" : "ux-feedback"
                }
              >
                {practice.feedback || `Expected: ${answer}`}
              </p>
            )}
          </div>
        ) : practice.revealed ? (
          <p className="ux-card-answer">{answer}</p>
        ) : (
          <InkButton
            type="button"
            onClick={() => setPractice({ revealed: true })}
          >
            Reveal answer
          </InkButton>
        )}
      </div>
      <div className="ux-practice-controls">
        <InkButton
          type="button"
          onClick={() => {
            setPractice({
              index: (practice.index + deck.length - 1) % deck.length,
              revealed: false,
              answer: "",
              feedback: "",
            });
          }}
        >
          Previous
        </InkButton>
        <InkButton
          type="button"
          onClick={() => setPractice({ revealed: !practice.revealed })}
        >
          {practice.revealed ? "Hide answer" : "Reveal"}
        </InkButton>
        <InkButton
          type="button"
          onClick={() => {
            setPractice({
              index: (practice.index + 1) % deck.length,
              revealed: false,
              answer: "",
              feedback: "",
            });
          }}
        >
          Next
        </InkButton>
      </div>
      <div className="ux-pair-editor">
        <InkButton
          aria-expanded={practice.editing}
          onClick={() => setPractice({ editing: !practice.editing })}
        >
          {practice.editing ? "Close pair editor" : "Edit pair list"}
        </InkButton>
        <p className="lab-muted">
          Focus the card for keyboard arrows and Space. Controller A reveals; B
          advances. Physical controller behaviour has not been tested.
        </p>
        {practice.editing &&
          deck.map((item, index) => (
            <div className="ux-pair-row" key={item.id}>
              <InkInput
                aria-label={`German pair ${index + 1}`}
                value={item.german}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    pairs: deck.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            german: event.target.value,
                            reviewed: false,
                          }
                        : entry,
                    ),
                  }))
                }
              />
              <span>—</span>
              <InkInput
                aria-label={`Dutch pair ${index + 1}`}
                value={item.dutch}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    pairs: deck.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            dutch: event.target.value,
                            reviewed: false,
                          }
                        : entry,
                    ),
                  }))
                }
              />
              {item.generated && <small>generated draft</small>}
            </div>
          ))}
      </div>
    </ScreenFrame>
  );
}

export function ListenScreen({ onSignature }: SharedScreenProps) {
  const { state, update, setView, notify } = useLab();
  const audio = state.audio;
  const seek = (seconds: number) =>
    update((current) => ({ ...current, audio: { ...current.audio, seconds } }));
  return (
    <ScreenFrame
      title="Water and society · lesson"
      eyebrow="Listen · simulated transport"
    >
      <div className="ux-audio-note">
        <p>
          This is a simulated 18-minute lesson. Your saved position remains
          available while you inspect context.
        </p>
        <div className="ux-audio-time">
          <strong>{formatTime(audio.seconds)}</strong>
          <span>/ 18:00</span>
        </div>
        <InkInput
          aria-label="Lesson position"
          type="range"
          min="0"
          max="1080"
          value={audio.seconds}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <div className="ux-audio-controls">
          <InkButton
            type="button"
            onClick={() =>
              update((current) => ({
                ...current,
                audio: { ...current.audio, playing: !current.audio.playing },
              }))
            }
          >
            {audio.playing ? "Pause" : "Resume"}
          </InkButton>
          <InkSelect
            aria-label="Playback speed"
            value={String(audio.speed)}
            onChange={(event) =>
              update((current) => ({
                ...current,
                audio: { ...current.audio, speed: Number(event.target.value) },
              }))
            }
          >
            <option value="0.75">0.75×</option>
            <option value="1">1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
          </InkSelect>
          <InkButton
            type="button"
            onClick={() =>
              document
                .querySelector(".ux-transcript")
                ?.scrollIntoView({ block: "nearest" })
            }
          >
            Transcript
          </InkButton>
        </div>
      </div>
      <div className="ux-transcript">
        <h2>Transcript excerpt</h2>
        <p>
          <mark>07:42</mark> In the pilot survey, 12 of 40 participating
          households reported moving after the reservoir opened.
        </p>
        <p className="ux-qualification">
          A separate source says the survey did not establish why they moved.
        </p>
        <button
          type="button"
          onClick={() =>
            setView({
              contextTab: "evidence",
              evidence: {
                id: "survey",
                title: "Pilot survey",
                text: "12 of 40 participating households reported moving after the reservoir opened.",
                revision: 1,
              },
              panel: "context",
            })
          }
        >
          Inspect source evidence
        </button>
      </div>
      <div className="ux-listen-help">
        <strong>Need contextual help?</strong>
        <span>
          Open the evidence inspector while the lesson keeps its position.
        </span>
        <InkButton
          type="button"
          onClick={() => {
            if (state.direction === 5) onSignature?.();
            else
              setView({
                panel: "context",
                contextTab: "evidence",
                evidence: {
                  id: "methods-definitions",
                  title: "What the survey can explain",
                  text: "The pilot group includes participating households reached by the survey; it is not a census. The survey did not establish why they moved.",
                  revision: 1,
                },
              });
          }}
        >
          Ask for help
        </InkButton>
      </div>
    </ScreenFrame>
  );
}

function suggestionStatus(suggestion: Suggestion) {
  return suggestion.status === "stale"
    ? "Stale source"
    : suggestion.uncertain
      ? "Needs judgement"
      : suggestion.status;
}

export function ReviewPanel({ compact = false }: { compact?: boolean } = {}) {
  const { state, applySuggestion, undoSuggestion, update, setView } = useLab();
  const [filter, setFilter] = useState("pending");
  const [expanded, setExpanded] = useState("A");
  const suggestions = state.suggestions.filter(
    (item) =>
      filter === "all" ||
      item.status === filter ||
      (filter === "pending" && item.status === "stale"),
  );
  const dismiss = (id: string) =>
    update((current) => ({
      ...current,
      suggestions: current.suggestions.map((item) =>
        item.id === id ? { ...item, status: "dismissed" } : item,
      ),
    }));
  const refreshStale = (item: Suggestion) =>
    update((current) => ({
      ...current,
      suggestions: current.suggestions.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              status: "pending",
              baseRevision:
                current.notes.find((note) => note.id === entry.noteId)
                  ?.revision || entry.baseRevision,
            }
          : entry,
      ),
    }));
  return (
    <section className="ux-review-panel" aria-label="Suggestions and review">
      <div className="ux-panel-heading">
        <div>
          <p className="ux-eyebrow">Context · review</p>
          <h2>Suggestions</h2>
        </div>
        <InkSelect
          aria-label="Filter suggestions"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="all">All</option>
          <option value="stale">Stale</option>
          <option value="dismissed">Dismissed</option>
          <option value="applied">Applied</option>
        </InkSelect>
      </div>
      {suggestions.map((item) => (
        <article
          className={`ux-suggestion ux-suggestion-${item.status}`}
          key={item.id}
        >
          <div className="ux-suggestion-title">
            {compact ? (
              <InkButton
                className="sketch-review-disclosure"
                aria-expanded={expanded === item.id}
                onClick={() => setExpanded(expanded === item.id ? "" : item.id)}
              >
                {item.title}
                <span aria-hidden="true">
                  {expanded === item.id ? "−" : "+"}
                </span>
              </InkButton>
            ) : (
              <strong>{item.title}</strong>
            )}
            <span>{suggestionStatus(item)}</span>
          </div>
          <div hidden={compact && expanded !== item.id}>
            <p>{item.detail}</p>
            <blockquote>{item.quote}</blockquote>
            <p className="ux-proposed">
              <strong>Proposed:</strong> {item.addition}
            </p>
            <p className="ux-uncertainty">
              Evidence is scoped to revision {item.baseRevision}; inspect the
              source before treating this as a fact.
            </p>
            <div className="ux-suggestion-actions">
              <InkButton
                type="button"
                onClick={() =>
                  setView({
                    contextTab: "evidence",
                    evidence: {
                      id: item.noteId,
                      title: item.title,
                      text: item.quote,
                      revision: item.baseRevision,
                    },
                  })
                }
              >
                Inspect evidence
              </InkButton>
              {item.status === "stale" && (
                <InkButton type="button" onClick={() => refreshStale(item)}>
                  Refresh for manual review
                </InkButton>
              )}
              {item.status === "pending" && (
                <>
                  <InkButton
                    type="button"
                    onClick={() => applySuggestion(item.id)}
                  >
                    Apply
                  </InkButton>
                  <InkButton type="button" onClick={() => dismiss(item.id)}>
                    Dismiss
                  </InkButton>
                </>
              )}
              {item.status === "applied" && (
                <InkButton
                  type="button"
                  onClick={() => undoSuggestion(item.id)}
                >
                  Undo
                </InkButton>
              )}
            </div>
          </div>
        </article>
      ))}
      {!suggestions.length && (
        <p className="ux-empty">No suggestions in this view.</p>
      )}
    </section>
  );
}

export function ActivityPanel() {
  const { state, startJob, cancelJob, update } = useLab();
  return (
    <section className="ux-activity-panel" aria-label="Activity">
      <div className="ux-panel-heading">
        <div>
          <p className="ux-eyebrow">Context · background work</p>
          <h2>Activity</h2>
        </div>
        <InkButton
          type="button"
          onClick={() => startJob("Index source snapshots")}
        >
          Start indexing
        </InkButton>
      </div>
      {state.jobs.map((job) => (
        <article className="ux-job" key={job.id}>
          <div>
            <strong>{job.label}</strong>
            <span>
              {job.status} · {Math.round(job.progress * 100)}%
            </span>
          </div>
          <progress value={job.progress * 100} max="100" />
          {job.status === "running" ? (
            <InkButton type="button" onClick={() => cancelJob(job.id)}>
              Stop
            </InkButton>
          ) : job.status === "failed" || job.status === "cancelled" ? (
            <InkButton type="button" onClick={() => startJob(job.label)}>
              Retry
            </InkButton>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export function NotebookOverview({ onImport }: SharedScreenProps) {
  const { state, view, navigate, openNote } = useLab();
  const collection = state.collections?.find(
    (c) => c.id === state.activeCollection,
  );
  const recent = state.notes
    .filter((n) => !collection || collection.noteIds.includes(n.id))
    .slice(0, 3);
  return (
    <ScreenFrame
      title={
        collection?.title ||
        (state.notebook === "german"
          ? "Duits · vocabulary"
          : "Water and society")
      }
      eyebrow="Notebook overview"
    >
      <div className="ux-overview-intro">
        <p>
          A research notebook with eight core notes, source snapshots and an
          18-minute lesson. Keep material, work and context connected as you
          study.
        </p>
        <InkButton type="button" onClick={onImport}>
          Add material
        </InkButton>
      </div>
      <div className="ux-overview-grid">
        <section>
          <h2>Continue</h2>
          <button
            type="button"
            className="ux-overview-link"
            onClick={() => {
              openNote(view.noteId);
              navigate("notes");
            }}
          >
            <strong>
              {noteById(state.notes, view.noteId)?.title ||
                "Open your current note"}
            </strong>
            <span>Return to the last reading position</span>
          </button>
          <button
            type="button"
            className="ux-overview-link"
            onClick={() => navigate("listen")}
          >
            <strong>Resume lesson · {formatTime(state.audio.seconds)}</strong>
            <span>Transport is simulated for this prototype</span>
          </button>
        </section>
        <section>
          <h2>Recent notes</h2>
          {recent.map((note) => (
            <button
              type="button"
              className="ux-overview-link"
              key={note.id}
              onClick={() => {
                openNote(note.id);
                navigate("notes");
              }}
            >
              <strong>{note.title}</strong>
              <span>{note.path}</span>
            </button>
          ))}
        </section>
        <section>
          <h2>Learning work</h2>
          <button
            type="button"
            className="ux-overview-link"
            onClick={() => navigate("ask")}
          >
            <strong>Ask from selected sources</strong>
            <span>{state.sourceIds.length} snapshots selected</span>
          </button>
          <button
            type="button"
            className="ux-overview-link"
            onClick={() => navigate("practice")}
          >
            <strong>Practice German deck</strong>
            <span>{state.pairs.length || 12} editable pairs</span>
          </button>
        </section>
      </div>
    </ScreenFrame>
  );
}
