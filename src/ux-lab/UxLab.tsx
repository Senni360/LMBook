/* THESIS: ten working alternatives, one safe comparison library.
 * OWN-WORLD: Ink paper, purposeful pen contours, quiet blue selection.
 * STORY: choose a direction, perform a real demo task, compare its tradeoff.
 * FIRST VIEWPORT: slim comparison bar, notebook identity, direction-specific workspace.
 * FORM: owner-selected ten compositions; no aesthetic randomisation or live data access.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Headphones,
  Home,
  MessageSquare,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import {
  InkButton as Button,
  InkInput as Input,
  InkSelect as Select,
  InkTextarea as Textarea,
} from "../components/InkControl";
import { confirmInk } from "../components/InkDialog";
import { DesktopBar } from "../components/DesktopBar";
import { LabProvider, useLab, directions } from "./state";
import { SketchWorkspace } from "./SketchWorkspace";
import { LabLayout } from "./LabLayouts";
import { LabSignature } from "./LabSignatures";
import {
  MaterialBrowser,
  NoteScreen,
  AskScreen,
  PracticeScreen,
  ListenScreen,
  ReviewPanel,
  ActivityPanel,
  NotebookOverview,
} from "./LabScreens";
import type { Task } from "./types";
import "./ux-lab.css";

const taskNames: [Task, string, typeof FileText][] = [
  ["notes", "Notes", FileText],
  ["ask", "Ask", MessageSquare],
  ["practice", "Practice", BookOpen],
  ["listen", "Listen", Headphones],
];

function LabDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.isConnected && previous.focus();
    };
  }, []);
  return (
    <dialog
      className="lab-dialog"
      ref={ref}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="lab-dialog-heading">
        <h2>{title}</h2>
        <Button aria-label={`Close ${title}`} onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}

export function UxLab({ onExit }: { onExit: () => void }) {
  return (
    <LabProvider>
      <LabExperience onExit={onExit} />
    </LabProvider>
  );
}

function LabExperience({ onExit }: { onExit: () => void }) {
  const {
    state,
    view,
    update,
    setView,
    navigate,
    openNote,
    notify,
    notice,
    storageError,
    reset,
    startJob,
  } = useLab();
  const [dialog, setDialog] = useState<
    "import" | "settings" | "guide" | "scenarios" | "create" | null
  >(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const workspaceMenu = useRef<HTMLDivElement>(null);
  const preview = new URLSearchParams(location.search).has("desktop-preview");
  const requestedDirection = useRef(
    Number(new URLSearchParams(location.search).get("ux-lab")),
  );
  const direction = directions.find((d) => d.id === state.direction)!;
  const collection = state.collections?.find(
    (c) => c.id === state.activeCollection,
  );
  const title =
    collection?.title ||
    (state.notebook === "german"
      ? "Duits — hoofdstuk 11–15"
      : "Water and society");
  useEffect(() => {
    const requested = requestedDirection.current;
    if (requested >= 1 && requested <= directions.length)
      update((s) => ({ ...s, direction: requested }));
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("ux-lab", String(state.direction));
    history.replaceState(null, "", url);
  }, [state.direction]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.code.startsWith("Digit")) {
        const n = Number(e.code.slice(5)) || 10;
        e.preventDefault();
        update((s) => ({ ...s, direction: n }));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const toggleSignature = () =>
    setView({ signatureOpen: true, panel: "context" });
  const props = {
    onSignature: toggleSignature,
    onImport: () => setDialog("import"),
    onSettings: () => setDialog("settings"),
  };
  const changeDirection = (n: number) =>
    update((s) => ({
      ...s,
      direction: Math.max(1, Math.min(directions.length, n)),
    }));
  const setTask = (task: Task) => {
    navigate(task);
    setView({ panel: "work" });
  };
  const activities = (
    <nav className="lab-activities" aria-label="Notebook activities">
      {[5, 9].includes(state.direction) && (
        <Button
          aria-pressed={view.task === "home"}
          onClick={() => setTask("home")}
        >
          <Home size={16} />
          Overview
        </Button>
      )}
      {taskNames.map(([task, label, Icon]) => (
        <Button
          key={task}
          aria-pressed={view.task === task}
          onClick={() => setTask(task)}
        >
          <Icon size={16} />
          {label}
        </Button>
      ))}
    </nav>
  );
  const workspace =
    view.task === "home" ? (
      <NotebookOverview {...props} />
    ) : view.task === "ask" ? (
      <AskScreen />
    ) : view.task === "practice" ? (
      <PracticeScreen />
    ) : view.task === "listen" ? (
      <ListenScreen {...props} />
    ) : (
      <NoteScreen
        key={state.direction === 1 && view.compare ? "claim" : view.noteId}
        noteId={state.direction === 1 && view.compare ? "claim" : view.noteId}
        {...props}
      />
    );
  const reader = (
    <NoteScreen
      noteId={
        state.direction === 1 && view.compare
          ? "survey"
          : [6, 8].includes(state.direction)
            ? "survey"
            : view.noteId
      }
      readonly
      {...props}
    />
  );
  const context = (
    <div className="lab-context-surface">
      <nav className="lab-context-tabs" aria-label="Supporting context">
        {(
          [
            ["suggestions", "Review"],
            ["evidence", "Evidence"],
            ["activity", "Activity"],
          ] as const
        ).map(([tab, label]) => (
          <Button
            key={tab}
            aria-pressed={view.contextTab === tab}
            onClick={() => setView({ contextTab: tab, panel: "context" })}
          >
            {label}
            {tab === "suggestions" && (
              <span className="lab-count">
                {
                  state.suggestions.filter(
                    (s) => s.status === "pending" || s.status === "stale",
                  ).length
                }
              </span>
            )}
          </Button>
        ))}
      </nav>
      {view.contextTab === "suggestions" ? (
        <ReviewPanel />
      ) : view.contextTab === "activity" ? (
        <ActivityPanel />
      ) : (
        <EvidenceView />
      )}
    </div>
  );
  const material =
    state.direction === 1 && view.compare ? (
      <div>
        <p className="lab-pane-label">1 · Examined source</p>
        {reader}
      </div>
    ) : state.direction === 7 ? (
      <TopicBrowser onImport={() => setDialog("import")} />
    ) : (
      <MaterialBrowser {...props} />
    );
  const notebookPicker = (
    <Select
      aria-label="Demo notebook"
      value={state.activeCollection || state.notebook}
      onChange={(e) => {
        const val = e.target.value;
        update((s) => ({
          ...s,
          notebook: val === "german" ? "german" : "water",
          activeCollection: ["water", "german"].includes(val) ? undefined : val,
        }));
        if (val === "german") setTask("practice");
        else {
          const c = state.collections?.find((c) => c.id === val);
          if (c?.noteIds[0]) openNote(c.noteIds[0]);
          setTask("notes");
        }
      }}
    >
      <option value="water">Water and society</option>
      <option value="german">Duits — hoofdstuk 11–15</option>
      {state.collections?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </Select>
  );
  const compactTools = (
    <div className="dock-topbar">
      {notebookPicker}
      <Select
        aria-label="UX direction"
        title="Choose your workspace layout"
        value={state.direction}
        onChange={(e) => changeDirection(Number(e.target.value))}
      >
        {directions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.id} · {d.title}
          </option>
        ))}
      </Select>
      <span
        className="dock-preview-badge"
        title="Illustrative notebook. AI and audio are simulated; changes are saved separately on this device."
      >
        Preview
      </span>
      <div className="dock-topbar-spacer" />
      <div ref={setToolbarHost} className="dock-layout-tools" />
      <Button
        aria-label="Workspace menu"
        title="Workspace, appearance and layout help"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (workspaceMenu.current) {
            workspaceMenu.current.style.left = `${Math.max(8, Math.min(innerWidth - 308, box.right - 300))}px`;
            workspaceMenu.current.style.top = `${box.bottom + 5}px`;
            workspaceMenu.current.togglePopover();
          }
        }}
      >
        <Settings2 size={16} />
      </Button>
    </div>
  );
  const menuAction = (action: () => void) => {
    workspaceMenu.current?.hidePopover();
    action();
  };
  const signature = <LabSignature />;
  return (
    <div
      className={`ux-lab ${state.direction === 11 ? "is-sketch-direction" : ""}`}
      data-lab-theme={state.theme}
      data-lab-accent={state.accent}
    >
      {window.sennibookDesktop && (
        <DesktopBar
          title={`LMBook · ${title} · Live preview`}
          onNew={() => setDialog("create")}
          onSettings={() => setDialog("settings")}
        >
          {state.direction === 11 ? compactTools : undefined}
        </DesktopBar>
      )}
      {state.direction === 11 && !window.sennibookDesktop && compactTools}
      {state.direction !== 11 && (
        <>
          <header className="lab-comparison-bar">
            <a
              className="lab-wordmark"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                preview ? changeDirection(11) : onExit();
              }}
            >
              <BookOpen size={22} /> LMBook<span>UX lab</span>
            </a>
            <div className="lab-direction-picker">
              <Button
                aria-label="Previous direction"
                disabled={state.direction === 1}
                onClick={() => changeDirection(state.direction - 1)}
              >
                <ArrowLeft size={17} />
              </Button>
              <Select
                aria-label="UX direction"
                value={state.direction}
                onChange={(e) => changeDirection(Number(e.target.value))}
              >
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {String(d.id).padStart(2, "0")} · {d.title}
                  </option>
                ))}
              </Select>
              <Button
                aria-label="Next direction"
                disabled={state.direction === directions.length}
                onClick={() => changeDirection(state.direction + 1)}
              >
                <ArrowRight size={17} />
              </Button>
            </div>
            <div className="lab-comparison-actions">
              <Button onClick={() => setDialog("guide")}>
                About this direction
              </Button>
              <Button
                aria-label={
                  state.theme === "light"
                    ? "Switch to dark mode"
                    : "Switch to light mode"
                }
                onClick={() =>
                  update((s) => ({
                    ...s,
                    theme: s.theme === "light" ? "dark" : "light",
                  }))
                }
              >
                {state.theme === "light" ? (
                  <Moon size={17} />
                ) : (
                  <Sun size={17} />
                )}
              </Button>
              <Button
                onClick={() => (preview ? changeDirection(11) : onExit())}
              >
                {preview ? "Back to workspace" : "Exit lab"}
              </Button>
            </div>
          </header>
          <div className="lab-notebook-bar">
            <div>
              <span className="lab-small-label">
                Illustrative notebook · saved separately from your library
              </span>
              <h1>{title}</h1>
            </div>
            <div className="lab-notebook-actions">
              {notebookPicker}
              <Button onClick={() => setDialog("create")}>
                <Plus size={16} />
                Create
              </Button>
              <Button
                aria-label="Demo settings"
                onClick={() => setDialog("settings")}
              >
                <Settings2 size={17} />
              </Button>
            </div>
          </div>
        </>
      )}
      {state.direction === 11 && (
        <div
          ref={workspaceMenu}
          popover="auto"
          className="dock-menu dock-workspace-menu"
        >
          <strong>Workspace</strong>

          <Button onClick={() => menuAction(() => setDialog("create"))}>
            Create in notebook
          </Button>
          <Button onClick={() => menuAction(() => setDialog("settings"))}>
            Settings & appearance
          </Button>
          <Button
            onClick={() =>
              menuAction(() =>
                update((s) => ({
                  ...s,
                  theme: s.theme === "light" ? "dark" : "light",
                })),
              )
            }
          >
            Switch to {state.theme === "light" ? "dark" : "light"} mode
          </Button>
          <Button onClick={() => menuAction(() => setDialog("guide"))}>
            How to arrange your workspace
          </Button>
          <Button onClick={() => menuAction(() => setDialog("scenarios"))}>
            Try an edge case
          </Button>
          <Button
            onClick={() =>
              menuAction(() => (preview ? changeDirection(1) : onExit()))
            }
          >
            {preview ? "Explore other designs" : "Exit lab"}
          </Button>
          <p>
            Drag a tab to an edge to place it beside or below another view. Pull
            any divider to resize. Double-click to balance.
          </p>
          <p>
            Illustrative notebook · simulated AI & audio.{" "}
            {storageError
              ? "Storage unavailable."
              : "Changes saved on this device."}
          </p>
        </div>
      )}
      {storageError && (
        <p className="lab-alert" role="alert">
          Browser storage is unavailable. Keep this tab open and export your
          demo work before leaving.
        </p>
      )}
      {state.detour && state.direction !== 5 && (
        <p className="lab-alert">
          Your study detour is paused in direction 05.{" "}
          <Button onClick={() => changeDirection(5)}>Return to session</Button>
        </p>
      )}
      {state.direction === 11 ? (
        <SketchWorkspace
          toolbarHost={toolbarHost}
          workspace={workspace}
          evidence={<EvidenceView />}
          onImport={() => setDialog("import")}
          onSettings={() => setDialog("settings")}
        />
      ) : (
        <LabLayout
          key={state.direction}
          direction={state.direction}
          navigation={material}
          workspace={workspace}
          reader={reader}
          context={context}
          overview={<NotebookOverview {...props} />}
          activityNav={activities}
          tabs={<LabTabs />}
          signature={signature}
          focus={view.focus}
          onFocus={() => setView({ focus: !view.focus })}
          task={view.task}
          activePanel={view.panel}
          onPanelChange={(panel) => setView({ panel })}
        />
      )}
      {state.direction !== 11 && (
        <footer className="lab-bottom-bar">
          <span>
            <span className="lab-status-dot" />
            {storageError
              ? "Drafts in this tab only"
              : "Demo changes saved on this device"}
          </span>
          <span>Simulated AI & audio · no API requests</span>
          <Button
            onClick={() => {
              setView({ contextTab: "activity", panel: "context" });
            }}
          >
            {state.jobs.filter((j) => j.status === "running").length} running
          </Button>
          <Button onClick={() => setDialog("scenarios")}>
            Try an edge case
          </Button>
        </footer>
      )}
      {notice && (
        <div className="lab-notice" role="status">
          {notice}
        </div>
      )}
      {dialog && (
        <LabDialog
          title={
            dialog === "import"
              ? "Add material"
              : dialog === "settings"
                ? "Demo settings"
                : dialog === "guide"
                  ? direction.title
                  : dialog === "create"
                    ? "Create in this notebook"
                    : "Try an edge case"
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "guide" && (
            <>
              <p>{direction.summary}</p>
              <div className="lab-guide-signature">
                <span className="lab-small-label">
                  Protected interaction · UX-
                  {String(state.direction).padStart(2, "0")}
                </span>
                <h3>{direction.signature}</h3>
                <p>
                  {state.direction === 11
                    ? "Drag a tab into another tab strip to group views, or drop it near an edge to split. Every divider resizes with pointer or arrow keys. The + menu offers move, split, focus and close actions. Layout undo and reset keep experimentation reversible."
                    : "Open “Try this direction’s idea” in the workspace to use it."}
                </p>
                <Button
                  onClick={() => {
                    if (state.direction !== 11) toggleSignature();
                    setDialog(null);
                  }}
                >
                  Try the interaction
                </Button>
              </div>
              <p>
                Compare the same tasks: edit a note, ask from two sources,
                inspect a suggestion, practise German and resume a lesson.
                Workspaces remember their own place; edits to the fictional
                material are shared.
              </p>
              <p className="lab-muted">
                Ctrl + Alt + 1–9 selects a direction; 0 selects direction 10.
              </p>
            </>
          )}
          {dialog === "settings" && (
            <DemoSettings
              onReset={async () => {
                if (
                  await confirmInk(
                    "This resets only UX lab notes, layouts and practice. Your real library is not affected.",
                    "Reset comparison data?",
                    "Reset demo",
                  )
                ) {
                  reset();
                  try {
                    localStorage.removeItem("lmbook-ux-lab-sketch-dock-v1");
                  } catch {}
                  for (let i = 1; i <= directions.length; i++) {
                    try {
                      localStorage.removeItem(`lmbook-ux-lab-layout-${i}`);
                    } catch {}
                  }
                  setDialog(null);
                }
              }}
            />
          )}
          {dialog === "import" && <ImportDemo onDone={() => setDialog(null)} />}
          {dialog === "scenarios" && <Scenarios />}
          {dialog === "create" && (
            <CreateDemo
              onDone={() => setDialog(null)}
              onImport={() => setDialog("import")}
            />
          )}
        </LabDialog>
      )}
    </div>
  );
}

function TopicBrowser({ onImport }: { onImport: () => void }) {
  const { state, view, openNote, navigate, setView } = useLab();
  const [files, setFiles] = useState(false);
  if (files)
    return (
      <div>
        <Button onClick={() => setFiles(false)}>Return to topic outline</Button>
        <MaterialBrowser onImport={onImport} />
      </div>
    );
  const groups = [
    { title: "Research question", ids: ["question", "open-questions"] },
    { title: "Survey and method", ids: ["survey", "methods-definitions"] },
    {
      title: "Findings and definitions",
      ids: ["relocation", "findings-definitions"],
    },
    { title: "Building an argument", ids: ["claim", "study"] },
  ];
  const lenses = [
    {
      title: "Who was represented in the survey?",
      ids: ["survey", "methods-definitions"],
    },
    {
      title: "What can the evidence explain?",
      ids: ["relocation", "claim", "findings-definitions"],
    },
    {
      title: "Which definitions differ?",
      ids: ["methods-definitions", "findings-definitions"],
    },
    { title: "What remains unanswered?", ids: ["open-questions"] },
  ];
  return (
    <nav className="lab-topic-navigation" aria-label="Topic outline">
      <h2>{view.questionLens ? "Your questions" : "Topic outline"}</h2>
      <p className="lab-muted">
        One notebook. Related material stays together.
      </p>
      <Button
        onClick={() =>
          setView({ questionLens: !view.questionLens, signatureOpen: true })
        }
      >
        {view.questionLens ? "View by topics" : "View by questions"}
      </Button>
      {(view.questionLens ? lenses : groups).map((g) => (
        <details key={g.title} open>
          <summary>{g.title}</summary>
          {g.ids.map((id) => (
            <Button
              key={id}
              aria-pressed={view.noteId === id}
              onClick={() => {
                openNote(id);
                navigate("notes");
                setView({
                  panel: "work",
                  selectedQuestion: view.questionLens ? g.title : "",
                });
              }}
            >
              {state.notes.find((n) => n.id === id)?.title}
              {view.questionLens && (
                <small className="lab-muted">
                  {state.notes.find((n) => n.id === id)?.path}
                </small>
              )}
            </Button>
          ))}
        </details>
      ))}
      <Button onClick={() => setFiles(true)}>
        Browse all {state.notes.length} files
      </Button>
      <Button onClick={onImport}>Import material</Button>
    </nav>
  );
}

function EvidenceView() {
  const { state, view, setView } = useLab();
  const e = view.evidence;
  if (!e)
    return (
      <section className="lab-evidence">
        <h2>Evidence, in context</h2>
        <p>
          Open a citation or inspect a suggestion to see the passage that was
          actually examined.
        </p>
        <Button
          onClick={() => {
            const n = state.notes.find((n) => n.id === "survey")!;
            setView({
              evidence: {
                id: n.id,
                title: n.title,
                text: n.text,
                revision: n.revision,
              },
            });
          }}
        >
          Inspect the survey passage
        </Button>
      </section>
    );
  const current = state.notes.find((n) => n.id === e.id);
  return (
    <section className="lab-evidence">
      <span className="lab-small-label">
        Examined snapshot · revision {e.revision}
      </span>
      <h2>{e.title}</h2>
      <blockquote>{e.text}</blockquote>
      {current?.revision !== e.revision && (
        <p className="lab-warning">
          The source has changed. This is the earlier excerpt used for this
          answer.
        </p>
      )}
      <Button onClick={() => setView({ evidence: undefined })}>
        Close evidence
      </Button>
    </section>
  );
}

function LabTabs() {
  const { state, view, setView, openNote, navigate, notify } = useLab();
  if (![1, 3, 4, 8].includes(state.direction)) return null;
  if (state.direction === 3 && view.task !== "notes") return null;
  const active =
    state.direction === 8 && view.task !== "notes"
      ? `task:${view.task}`
      : view.noteId;
  const title = (id: string) =>
    id.startsWith("task:")
      ? {
          ask: "Ask your sources",
          practice: "German practice",
          listen: "Reservoir lesson",
        }[id.slice(5)] || id
      : state.notes.find((n) => n.id === id)?.title || "Unavailable note";
  const activate = (id: string) => {
    if (id.startsWith("task:")) navigate(id.slice(5) as Task);
    else {
      openNote(id);
      navigate("notes");
    }
  };
  const close = (id: string) => {
    const tabs = view.tabs.filter((x) => x !== id);
    const next = tabs.at(-1);
    setView({
      tabs,
      closedTabs: [...view.closedTabs, id],
      pinned: view.pinned.filter((x) => x !== id),
    });
    if (active === id) {
      if (next) activate(next);
      else navigate("home");
    }
    if (state.drafts[id] !== undefined)
      notify("View closed. Your local draft is retained.");
  };
  return (
    <div className="lab-document-tabs" aria-label="Open documents">
      {view.tabs.map((id) => (
        <div key={id} className={active === id ? "active" : ""}>
          <Button aria-pressed={active === id} onClick={() => activate(id)}>
            {view.pinned.includes(id) && "• "}
            {title(id)}
            {state.drafts[id] !== undefined && " *"}
          </Button>
          <Button aria-label={`Close ${title(id)}`} onClick={() => close(id)}>
            <X size={12} />
          </Button>
        </div>
      ))}
      <details className="lab-tab-menu">
        <summary>Tabs</summary>
        <div>
          <Button
            disabled={!view.tabs.includes(active)}
            onClick={() =>
              setView({
                pinned: view.pinned.includes(active)
                  ? view.pinned.filter((x) => x !== active)
                  : [...view.pinned, active],
              })
            }
          >
            {view.pinned.includes(active)
              ? "Unpin current"
              : "Keep current open"}
          </Button>
          <Button
            disabled={!view.closedTabs.length}
            onClick={() => {
              const id = view.closedTabs.at(-1)!;
              setView({ closedTabs: view.closedTabs.slice(0, -1) });
              activate(id);
            }}
          >
            Reopen closed
          </Button>
          {view.tabs.map((id) => (
            <Button key={id} onClick={() => activate(id)}>
              {id.startsWith("task:")
                ? title(id)
                : state.notes.find((n) => n.id === id)?.path}
            </Button>
          ))}
        </div>
      </details>
    </div>
  );
}

function ImportDemo({ onDone }: { onDone: () => void }) {
  const { state, update, notify } = useLab();
  const [destination, setDestination] = useState("new");
  const [mode, setMode] = useState<"attached" | "copied">("copied");
  const [name, setName] = useState("Reservoir research");
  const [selected, setSelected] = useState([
    "survey",
    "methods-definitions",
    "claim",
  ]);
  return (
    <>
      <p>
        Try importing the supplied fictional vault. This picker never accesses
        folders on your computer.
      </p>
      <label>
        Destination
        <Select
          aria-label="Destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="new">New notebook</option>
          <option value="existing">Current notebook</option>
        </Select>
      </label>
      {destination === "new" && (
        <label>
          Notebook name
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <label>
        File relationship
        <Select
          aria-label="File relationship"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="copied">Copy into notebook</option>
          <option value="attached">Open shared folder in place</option>
        </Select>
      </label>
      <p className="lab-muted">
        {mode === "attached"
          ? "In the real app, saves would change files read by Obsidian. Here the relationship is simulated with the same demo objects."
          : "Copies become separate demo notes. Their original fixture notes stay intact."}
      </p>
      <div className="lab-inline-actions">
        <Button
          onClick={() => setSelected(state.notes.slice(0, 8).map((n) => n.id))}
        >
          Select all eight
        </Button>
        <Button onClick={() => setSelected([])}>Clear</Button>
      </div>
      <div className="lab-import-list">
        {state.notes.slice(0, 8).map((n) => (
          <label key={n.id}>
            <input
              type="checkbox"
              checked={selected.includes(n.id)}
              onChange={() =>
                setSelected((s) =>
                  s.includes(n.id) ? s.filter((x) => x !== n.id) : [...s, n.id],
                )
              }
            />
            {n.path}
          </label>
        ))}
      </div>
      <Button
        disabled={!selected.length || (destination === "new" && !name.trim())}
        onClick={() => {
          const collectionId = crypto.randomUUID();
          update((s) => {
            const source = s.notes.filter((n) => selected.includes(n.id));
            const copies =
              mode === "copied"
                ? source.map((n) => ({
                    ...n,
                    id: crypto.randomUUID(),
                    path: `Imported/${n.path}`,
                    revision: 1,
                  }))
                : [];
            const noteIds =
              mode === "copied"
                ? copies.map((n) => n.id)
                : source.map((n) => n.id);
            return {
              ...s,
              notes: [...s.notes, ...copies],
              imported: true,
              collections:
                destination === "new"
                  ? [
                      ...(s.collections || []),
                      { id: collectionId, title: name.trim(), noteIds, mode },
                    ]
                  : s.collections?.map((c) =>
                      c.id === s.activeCollection
                        ? {
                            ...c,
                            noteIds: [...new Set([...c.noteIds, ...noteIds])],
                          }
                        : c,
                    ),
              activeCollection:
                destination === "new" ? collectionId : s.activeCollection,
              sourceIds: noteIds,
              views: {
                ...s.views,
                [s.direction]: {
                  ...s.views[s.direction],
                  task: "notes",
                  noteId: noteIds[0],
                  tabs: [noteIds[0]],
                  panel: "work",
                },
              },
            };
          });
          notify(
            `${selected.length} demo notes ${mode === "copied" ? "copied" : "connected"}.`,
          );
          onDone();
        }}
      >
        Import {selected.length} notes
      </Button>
    </>
  );
}

function DemoSettings({ onReset }: { onReset: () => void }) {
  const { state, update, startJob } = useLab();
  const downloadRunning = state.jobs.some(
    (j) => j.status === "running" && j.label.includes("Download"),
  );
  return (
    <>
      <p className="lab-muted">
        These settings affect the comparison demo only. No accounts, API keys or
        downloads are used.
      </p>
      <label>
        Accent
        <Select
          aria-label="Accent"
          value={state.accent}
          onChange={(e) =>
            update((s) => ({
              ...s,
              accent: e.target.value as typeof state.accent,
            }))
          }
        >
          <option value="cobalt">Cobalt</option>
          <option value="moss">Moss</option>
          <option value="plum">Plum</option>
        </Select>
      </label>
      <label>
        Assistant edit control
        <Select
          aria-label="Assistant edit control"
          value={state.controlMode}
          onChange={(e) =>
            update((s) => ({
              ...s,
              controlMode: e.target.value as typeof state.controlMode,
            }))
          }
        >
          <option value="ask">Ask every time</option>
          <option value="obvious">Straightforward changes automatically</option>
          <option value="full">Full control within selected sources</option>
        </Select>
      </label>
      <p>
        All changes remain inspectable in Review. Switching modes does not apply
        existing suggestions retroactively.
      </p>
      <h3>Local meaning search</h3>
      <dl className="lab-settings-status">
        <div>
          <dt>Files</dt>
          <dd>{state.model.downloaded ? "Downloaded" : "Not downloaded"}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{state.model.checked ? "Checked" : "Not checked"}</dd>
        </div>
        <div>
          <dt>Search</dt>
          <dd>{state.model.enabled ? "Enabled" : "Disabled"}</dd>
        </div>
        <div>
          <dt>Notebook index</dt>
          <dd>{state.model.indexed ? "Ready" : "Not indexed"}</dd>
        </div>
      </dl>
      <div className="lab-inline-actions">
        <Button
          disabled={state.model.downloaded || downloadRunning}
          onClick={() => startJob("Download local search model")}
        >
          {downloadRunning
            ? "Downloading…"
            : state.model.downloaded
              ? "Already downloaded"
              : "Simulate download"}
        </Button>
        <Button
          disabled={
            !state.model.downloaded ||
            state.jobs.some(
              (j) => j.label === "Check local model" && j.status === "running",
            )
          }
          onClick={() => startJob("Check local model")}
        >
          Check runtime
        </Button>
        <Button
          disabled={!state.model.checked}
          onClick={() =>
            update((s) => ({
              ...s,
              model: { ...s.model, enabled: !s.model.enabled },
            }))
          }
        >
          {state.model.enabled ? "Disable search" : "Enable search"}
        </Button>
        <Button
          disabled={
            !state.model.enabled ||
            state.jobs.some(
              (j) => j.label === "Index notebook" && j.status === "running",
            )
          }
          onClick={() => startJob("Index notebook")}
        >
          Index notebook
        </Button>
      </div>
      <p className="lab-muted">
        Watch progress and cancel in Activity. These are simulated jobs.
      </p>
      <h3>Demo data</h3>
      <Button
        onClick={() => {
          const blob = new Blob([JSON.stringify(state, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "lmbook-ux-lab-demo.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Export demo state
      </Button>
      <Button onClick={onReset}>
        <RotateCcw size={15} />
        Reset demo
      </Button>
    </>
  );
}

function Scenarios() {
  const { state, view, update, notify, startJob } = useLab();
  return (
    <>
      <p>
        Trigger recoverable problems in the fictional notebook. Your actual
        files and providers are unaffected.
      </p>
      <div className="lab-scenario-list">
        <Button
          aria-pressed={state.saveFailure}
          onClick={() => update((s) => ({ ...s, saveFailure: !s.saveFailure }))}
        >
          {state.saveFailure ? "Restore saving" : "Simulate a failed save"}
        </Button>
        <Button
          aria-pressed={state.providerFailure}
          onClick={() =>
            update((s) => ({ ...s, providerFailure: !s.providerFailure }))
          }
        >
          {state.providerFailure
            ? "Restore provider"
            : "Simulate an unavailable provider"}
        </Button>
        <Button
          onClick={() => {
            update((s) => ({
              ...s,
              notes: s.notes.map((n) =>
                n.id === view.noteId
                  ? {
                      ...n,
                      text: `${n.text}\n\nExternal edit: this section now includes a qualification from a second reader.`,
                      revision: n.revision + 1,
                    }
                  : n,
              ),
              changedIds: [...new Set([...s.changedIds, view.noteId])],
            }));
            notify(
              "An external revision arrived. Any local draft is retained.",
            );
          }}
        >
          Change current note externally
        </Button>
        <Button
          onClick={() => {
            update((s) => ({
              ...s,
              notes: s.notes.map((n) =>
                n.id === "survey"
                  ? {
                      ...n,
                      text:
                        n.text + "\n\nUpdated: participation was voluntary.",
                      revision: n.revision + 1,
                    }
                  : n,
              ),
              changedIds: [...new Set([...s.changedIds, "survey"])],
            }));
            notify(
              "Survey source revised. Earlier answer snapshots remain unchanged.",
            );
          }}
        >
          Update the survey source
        </Button>
        <Button onClick={() => startJob("Index notebook")}>
          Start a cancellable indexing job
        </Button>
      </div>
    </>
  );
}

function CreateDemo({
  onDone,
  onImport,
}: {
  onDone: () => void;
  onImport: () => void;
}) {
  const { state, update, notify, navigate } = useLab();
  const [title, setTitle] = useState("");
  return (
    <>
      <label>
        New note title
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="A question worth keeping"
        />
      </label>
      <Button
        disabled={!title.trim()}
        onClick={() => {
          const id = crypto.randomUUID();
          update((s) => ({
            ...s,
            notes: [
              ...s.notes,
              {
                id,
                title: title.trim(),
                path: `Working notes/${title.trim().replace(/[\\/:*?"<>|]/g, "-")}.md`,
                text: `# ${title.trim()}\n\n`,
                revision: 1,
                source: false,
                topic: "Working notes",
              },
            ],
            collections: s.collections?.map((c) =>
              c.id === s.activeCollection
                ? { ...c, noteIds: [...c.noteIds, id] }
                : c,
            ),
            views: {
              ...s.views,
              [s.direction]: {
                ...s.views[s.direction],
                noteId: id,
                task: "notes",
                tabs: [...s.views[s.direction].tabs, id],
              },
            },
          }));
          notify("Demo note created.");
          onDone();
        }}
      >
        Create note
      </Button>
      <hr />
      <div className="lab-scenario-list">
        <Button onClick={onImport}>
          Import material into a new or existing notebook
        </Button>
        <Button
          onClick={() => {
            navigate("ask");
            onDone();
          }}
        >
          Start a source conversation
        </Button>
        <Button
          onClick={() => {
            navigate("practice");
            onDone();
          }}
        >
          Open the saved vocabulary deck
        </Button>
        <Button
          onClick={() => {
            navigate("listen");
            onDone();
          }}
        >
          Open the saved audio lesson
        </Button>
      </div>
    </>
  );
}
