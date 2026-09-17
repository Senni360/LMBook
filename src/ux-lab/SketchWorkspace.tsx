import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
  type DragEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  X,
  Maximize2,
  Minimize2,
  Undo2,
  Columns2,
  Rows2,
  RotateCcw,
  GripVertical,
} from "lucide-react";
import { InkButton as Button } from "../components/InkControl";
import { confirmInk } from "../components/InkDialog";
import {
  MaterialBrowser,
  NoteScreen,
  AskScreen,
  PracticeScreen,
  ListenScreen,
  ReviewPanel,
  ActivityPanel,
} from "./LabScreens";
import { LabViewScope, useLab } from "./state";
import type { ViewState, Task } from "./types";
import {
  dockKey,
  initialDock,
  restoreDock,
  newGroup,
  groups,
  mapGroup,
  removeTab,
  insertTab,
  splitGroup,
  removeGroup,
  resizeSplit,
  minimumSize,
  type DockNode,
  type DockGroup,
  type DockState,
  type DockSide,
  type DockSplit,
} from "./dock-layout";
import "./sketch-workspace.css";

const names: Record<string, string> = {
  notes: "Notes",
  sources: "Sources",
  chat: "Chat",
  review: "Review",
  evidence: "Evidence",
  activity: "Activity",
  practice: "Practice",
  listen: "Listen",
};
const taskTab = (task: Task) =>
  task === "ask" || task === "home" ? "chat" : task;
const tabTask = (tab: string): Task =>
  tab === "chat"
    ? "ask"
    : tab === "practice"
      ? "practice"
      : tab === "listen"
        ? "listen"
        : "notes";
type Controller = {
  dock: DockState;
  label: (tab: string) => string;
  open: (tab: string, target?: string) => void;
  activate: (group: string, tab: string) => void;
  close: (group: string, tab: string) => void;
  closePane: (id: string) => void;
  split: (id: string, side: Exclude<DockSide, "center">) => void;
  move: (tab: string, target: string, side?: DockSide, before?: string) => void;
  focus: (id: string) => void;
  position: (tab: string, patch: DockState["positions"][string]) => void;
  resize: (id: string, ratio: number, remember?: boolean) => void;
  remember: () => void;
  maximize: (id: string) => void;
  maximized: string | null;
  dragged: string | null;
  drag: (tab: string | null) => void;
  evidence: ReactNode;
  onImport: () => void;
  onSettings: () => void;
};
const DockContext = createContext<Controller | null>(null);
const useDock = () => useContext(DockContext)!;

export function SketchWorkspace({
  evidence,
  onImport,
  onSettings,
  toolbarHost,
}: {
  toolbarHost?: HTMLElement | null;
  workspace?: ReactNode;
  evidence: ReactNode;
  onImport: () => void;
  onSettings: () => void;
}) {
  const base = useLab();
  const [dock, setDock] = useState(() =>
    restoreDock(
      (tab) =>
        !!names[tab] ||
        (tab.startsWith("note:") &&
          base.state.notes.some((n) => n.id === tab.slice(5))),
    ),
  );
  const current = useRef(dock);
  current.current = dock;
  const history = useRef<Array<Pick<DockState, "root" | "focused" | "closed">>>(
    [],
  );
  const [maximized, setMaximized] = useState<string | null>(null),
    [dragged, setDragged] = useState<string | null>(null),
    [storageFailed, setStorageFailed] = useState(false);
  const [narrow, setNarrow] = useState(
    () => matchMedia("(max-width: 900px)").matches,
  );
  const lastWork = useRef(
    groups(dock.root).find((g) => g.tabs.includes("chat"))?.id || dock.focused,
  );
  const label = (tab: string) =>
    !tab
      ? "Empty"
      : names[tab] ||
        base.state.notes.find((n) => n.id === tab.slice(5))?.title ||
        "Unavailable note";
  const remember = () => {
    history.current = [
      ...history.current.slice(-19),
      {
        root: current.current.root,
        focused: current.current.focused,
        closed: current.current.closed,
      },
    ];
  };
  const change = (fn: (s: DockState) => DockState, record = false) => {
    if (record) remember();
    const next = fn(current.current);
    current.current = next;
    setDock(next);
  };
  useEffect(() => {
    try {
      localStorage.setItem(dockKey, JSON.stringify(dock));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [dock]);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)");
    const listener = () => setNarrow(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  const focus = (id: string) => {
    const pane = groups(current.current.root).find((g) => g.id === id);
    if (
      pane?.active &&
      (pane.active === "chat" ||
        pane.active.startsWith("note:") ||
        ["practice", "listen"].includes(pane.active))
    )
      lastWork.current = id;
    if (current.current.focused !== id) change((s) => ({ ...s, focused: id }));
  };
  const open = (tab: string, target?: string) => {
    const leaves = groups(current.current.root),
      existing = leaves.find((g) => g.tabs.includes(tab)),
      work = leaves.find((g) => g.id === lastWork.current);
    const preferred =
      target || existing?.id || work?.id || current.current.focused;
    change(
      (s) => ({
        ...s,
        root: insertTab(s.root, preferred, tab),
        focused: preferred,
        closed: s.closed.filter((t) => t !== tab),
      }),
      !existing || (!!target && existing.id !== target),
    );
    if (maximized && maximized !== preferred) setMaximized(preferred);
  };
  const move = (
    tab: string,
    target: string,
    side: DockSide = "center",
    before?: string,
  ) => {
    const source = groups(current.current.root).find((g) =>
      g.tabs.includes(tab),
    );
    if (
      source?.id === target &&
      source.tabs.length === 1 &&
      side !== "center"
    ) {
      setDragged(null);
      return;
    }
    if (side === "center")
      change(
        (s) => ({
          ...s,
          root: insertTab(s.root, target, tab, before),
          focused: target,
        }),
        true,
      );
    else {
      const pane = newGroup([tab]);
      change(
        (s) => ({
          ...s,
          root: splitGroup(removeTab(s.root, tab), target, side, pane),
          focused: pane.id,
        }),
        true,
      );
      setMaximized(null);
    }
    setDragged(null);
    // Moving the last tab also returns its old space to the remaining panes.
    if (source && source.id !== target) {
      const empty = groups(current.current.root).find(
        (g) => g.id === source.id && !g.tabs.length,
      );
      if (empty)
        change((s) => ({
          ...s,
          root: removeGroup(s.root, empty.id) || s.root,
        }));
    }
    if (side === "center" && maximized) setMaximized(target);
  };
  const split = (id: string, side: Exclude<DockSide, "center">) => {
    const group = groups(current.current.root).find((g) => g.id === id)!;
    const tab = group.tabs.length > 1 ? group.active : undefined,
      pane = newGroup(tab ? [tab] : []);
    change(
      (s) => ({
        ...s,
        root: splitGroup(tab ? removeTab(s.root, tab) : s.root, id, side, pane),
        focused: pane.id,
      }),
      true,
    );
    lastWork.current = pane.id;
    setMaximized(null);
  };
  const close = (id: string, tab: string) => {
    change(
      (s) => ({
        ...s,
        root: removeTab(s.root, tab),
        closed: [...s.closed.filter((t) => t !== tab), tab],
      }),
      true,
    );
    if (
      tab.startsWith("note:") &&
      base.state.drafts[tab.slice(5)] !== undefined
    )
      base.notify(
        "Tab closed. Your note draft is still saved in the notebook.",
      );
  };
  const closePane = (id: string) => {
    const pane = groups(current.current.root).find((g) => g.id === id)!;
    change((s) => {
      const root = removeGroup(s.root, id) || newGroup();
      return {
        ...s,
        root,
        focused: groups(root)[0].id,
        closed: [...s.closed, ...pane.tabs],
      };
    }, true);
    setMaximized(null);
    base.notify("Pane closed. Notes, conversations and local drafts are kept.");
  };
  const globalNav = useRef(`${base.view.task}:${base.view.noteId}`);
  useEffect(() => {
    const key = `${base.view.task}:${base.view.noteId}`;
    if (key !== globalNav.current) {
      globalNav.current = key;
      open(
        base.view.task === "notes"
          ? `note:${base.view.noteId}`
          : taskTab(base.view.task),
      );
    }
  }, [base.view.task, base.view.noteId]);
  const globalContext = useRef(`${base.view.panel}:${base.view.contextTab}`);
  useEffect(() => {
    const key = `${base.view.panel}:${base.view.contextTab}`;
    if (key !== globalContext.current) {
      globalContext.current = key;
      if (base.view.panel === "context")
        open(
          base.view.contextTab === "suggestions"
            ? "review"
            : base.view.contextTab,
        );
    }
  }, [base.view.panel, base.view.contextTab]);
  const controller: Controller = {
    dock,
    label,
    open,
    activate: (id, tab) => {
      change((s) => ({
        ...s,
        root: mapGroup(s.root, id, (g) => ({ ...g, active: tab })),
        focused: id,
      }));
      focus(id);
    },
    close,
    closePane,
    split,
    move,
    focus,
    position: (tab, patch) =>
      change((s) => ({
        ...s,
        positions: { ...s.positions, [tab]: { ...s.positions[tab], ...patch } },
      })),
    resize: (id, ratio, record = false) =>
      change((s) => ({ ...s, root: resizeSplit(s.root, id, ratio) }), record),
    remember,
    maximize: (id) => setMaximized((v) => (v === id ? null : id)),
    maximized,
    dragged,
    drag: setDragged,
    evidence,
    onImport,
    onSettings,
  };
  const leaves = groups(dock.root),
    single =
      leaves.find((g) => g.id === (maximized || dock.focused)) || leaves[0],
    minimum = minimumSize(dock.root);
  return (
    <DockContext.Provider value={controller}>
      <main
        className="sketch-workspace dock-workspace"
        aria-label="Customizable tab workspace"
      >
        {toolbarHost &&
          createPortal(
            <div className="dock-toolbar">
              {narrow ? (
                <label>
                  Pane{" "}
                  <select
                    aria-label="Visible pane"
                    value={single.id}
                    onChange={(e) => {
                      setMaximized(null);
                      focus(e.target.value);
                    }}
                  >
                    {leaves.map((g, i) => (
                      <option key={g.id} value={g.id}>
                        {i + 1} · {label(g.active)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div>
                <Button
                  disabled={!history.current.length}
                  aria-label="Undo layout change"
                  onClick={() => {
                    const previous = history.current.pop();
                    if (previous) change((s) => ({ ...s, ...previous }));
                    setMaximized(null);
                  }}
                >
                  <Undo2 size={15} />
                </Button>
                {maximized && (
                  <Button onClick={() => setMaximized(null)}>
                    <Minimize2 size={15} />
                    Show all panes
                  </Button>
                )}
                <Button
                  aria-label="Reset layout"
                  onClick={async () => {
                    if (
                      await confirmInk(
                        "Return to notes and sources on the left, chat in the centre and review on the right? Your content and drafts are kept.",
                        "Reset layout?",
                        "Reset layout",
                      )
                    ) {
                      change(
                        (s) => ({
                          ...initialDock(),
                          closed: [
                            ...s.closed,
                            ...groups(s.root)
                              .flatMap((g) => g.tabs)
                              .filter((t) => !names[t]),
                          ],
                          positions: s.positions,
                        }),
                        true,
                      );
                      setMaximized(null);
                    }
                  }}
                >
                  <RotateCcw size={15} />
                </Button>
              </div>
            </div>,
            toolbarHost,
          )}
        {storageFailed && (
          <p role="status" className="lab-warning">
            Layout could not be saved to this device. Keep this window open to
            retain it.
          </p>
        )}
        <div className="dock-canvas">
          <div
            className="dock-root"
            style={
              narrow || maximized
                ? undefined
                : { minWidth: minimum.width, minHeight: minimum.height }
            }
          >
            {narrow || maximized ? (
              <DockPane key={single.id} group={single} />
            ) : (
              <DockBranch node={dock.root} />
            )}
          </div>
        </div>
      </main>
    </DockContext.Provider>
  );
}
function DockBranch({ node }: { node: DockNode }) {
  if (node.kind === "group") return <DockPane key={node.id} group={node} />;
  const a = minimumSize(node.first),
    b = minimumSize(node.second),
    size = `minmax(${node.axis === "x" ? a.width : a.height}px, ${node.ratio}fr) 8px minmax(${node.axis === "x" ? b.width : b.height}px, ${1 - node.ratio}fr)`;
  return (
    <div
      className={`dock-split dock-split-${node.axis}`}
      style={
        node.axis === "x"
          ? { gridTemplateColumns: size, minWidth: a.width + b.width + 8 }
          : { gridTemplateRows: size, minHeight: a.height + b.height + 8 }
      }
    >
      <DockBranch node={node.first} />
      <DockDivider split={node} />
      <DockBranch node={node.second} />
    </div>
  );
}
function DockDivider({ split }: { split: DockSplit }) {
  const dock = useDock(),
    drag = useRef<{ at: number; ratio: number; length: number } | null>(null);
  return (
    <div
      className={`dock-divider dock-divider-${split.axis}`}
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${split.axis === "x" ? "columns" : "rows"}`}
      aria-orientation={split.axis === "x" ? "vertical" : "horizontal"}
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(split.ratio * 100)}
      onPointerDown={(e) => {
        dock.remember();
        e.currentTarget.setPointerCapture(e.pointerId);
        const box = e.currentTarget.parentElement!.getBoundingClientRect();
        drag.current = {
          at: split.axis === "x" ? e.clientX : e.clientY,
          ratio: split.ratio,
          length: (split.axis === "x" ? box.width : box.height) - 8,
        };
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (drag.current)
          dock.resize(
            split.id,
            drag.current.ratio +
              ((split.axis === "x" ? e.clientX : e.clientY) - drag.current.at) /
                drag.current.length,
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={() => dock.resize(split.id, 0.5, true)}
      onKeyDown={(e) => {
        if (
          [
            "Home",
            "End",
            "Enter",
            ...(split.axis === "x"
              ? ["ArrowLeft", "ArrowRight"]
              : ["ArrowUp", "ArrowDown"]),
          ].includes(e.key)
        ) {
          e.preventDefault();
          dock.resize(
            split.id,
            e.key === "Home"
              ? 0.1
              : e.key === "End"
                ? 0.9
                : e.key === "Enter"
                  ? 0.5
                  : split.ratio +
                    (["ArrowLeft", "ArrowUp"].includes(e.key) ? -0.025 : 0.025),
            true,
          );
        }
      }}
    >
      <span />
    </div>
  );
}
function tabKeys(e: KeyboardEvent<HTMLElement>) {
  const target = e.target as HTMLElement;
  if (target.getAttribute("role") !== "tab") return;
  const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ),
    i = tabs.indexOf(target as HTMLButtonElement),
    next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i + tabs.length - 1) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
  if (next < 0) return;
  e.preventDefault();
  tabs[next].focus();
  tabs[next].click();
  tabs[next].scrollIntoView({ block: "nearest", inline: "nearest" });
}
function DockPane({ group }: { group: DockGroup }) {
  const dock = useDock(),
    base = useLab(),
    [drop, setDrop] = useState<DockSide | null>(null),
    menu = useRef<HTMLDivElement>(null),
    tab = group.active,
    noteId = tab.startsWith("note:") ? tab.slice(5) : base.view.noteId,
    isMaterial = tab === "notes" || tab === "sources",
    position = dock.dock.positions[tab] || {};
  const view: ViewState = {
    ...base.view,
    noteId,
    task: tabTask(tab),
    filter: position.filter || "",
    scroll: position.scroll || 0,
  };
  const setView = (patch: Partial<ViewState>) => {
    if (patch.scroll !== undefined || patch.filter !== undefined)
      dock.position(tab, {
        ...(patch.scroll !== undefined ? { scroll: patch.scroll } : {}),
        ...(patch.filter !== undefined ? { filter: patch.filter } : {}),
      });
    if (patch.evidence !== undefined || patch.contextTab) {
      base.setView(patch);
      dock.open(
        patch.contextTab === "suggestions"
          ? "review"
          : patch.contextTab || "evidence",
      );
    } else if (Object.hasOwn(patch, "evidence")) base.setView(patch);
  };
  const scope = {
    ...base,
    view,
    setView,
    openNote: (id: string) => dock.open(`note:${id}`),
    navigate: (task: Task) => {
      if (task !== "notes") dock.open(taskTab(task));
    },
  };
  const chooseSide = (e: DragEvent<HTMLElement>): DockSide => {
    if ((e.target as HTMLElement).closest(".sketch-work-tabs")) return "center";
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    if (x < 0.22) return "left";
    if (x > 0.78) return "right";
    if (y < 0.25) return "top";
    if (y > 0.75) return "bottom";
    return "center";
  };
  const showMenu = (e: MouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (menu.current) {
      menu.current.style.left = `${Math.max(10, Math.min(innerWidth - 280, box.right - 260))}px`;
      menu.current.style.top = `${Math.max(10, Math.min(innerHeight - 520, box.bottom + 4))}px`;
      menu.current.togglePopover();
    }
  };
  const action = (fn: () => void) => {
    menu.current?.hidePopover();
    fn();
  };
  let content: ReactNode;
  if (isMaterial)
    content = (
      <MaterialBrowser
        key={tab}
        mode={tab as "notes" | "sources"}
        onImport={dock.onImport}
        onSettings={dock.onSettings}
      />
    );
  else if (tab === "chat") content = <AskScreen />;
  else if (tab === "review") content = <ReviewPanel compact />;
  else if (tab === "evidence") content = dock.evidence;
  else if (tab === "activity") content = <ActivityPanel />;
  else if (tab === "practice") content = <PracticeScreen />;
  else if (tab === "listen")
    content = <ListenScreen onSignature={() => dock.open("evidence")} />;
  else if (
    tab.startsWith("note:") &&
    base.state.notes.some((n) => n.id === noteId)
  )
    content = (
      <NoteScreen
        key={noteId}
        noteId={noteId}
        onSignature={() => dock.open("review")}
      />
    );
  else
    content = (
      <div className="dock-empty">
        <Columns2 size={25} />
        <h2>Your space</h2>
        <p>Drop a tab here, or choose a view. You can split this pane again.</p>
        <div>
          {Object.entries(names)
            .filter(([id]) => !["evidence", "activity"].includes(id))
            .map(([id, name]) => (
              <Button key={id} onClick={() => dock.open(id, group.id)}>
                {name}
              </Button>
            ))}
        </div>
        <p className="lab-muted">
          An already open view moves here with its work intact.
        </p>
      </div>
    );
  return (
    <section
      className={`sketch-pane dock-pane ${isMaterial ? "sketch-material" : tab === "review" || tab === "evidence" || tab === "activity" ? "sketch-review" : "sketch-work"} ${tab === "chat" ? "is-chat" : ""} ${dock.dock.focused === group.id ? "is-focused" : ""}`}
      data-pane-id={group.id}
      aria-label={`${dock.label(tab)} pane`}
      onPointerDownCapture={() => dock.focus(group.id)}
      onFocusCapture={() => dock.focus(group.id)}
      onDragOver={(e) => {
        if (!dock.dragged) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDrop(chooseSide(e));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={(e) => {
        if (!dock.dragged) return;
        e.preventDefault();
        const before = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-tab]",
        )?.dataset.tab;
        if (chooseSide(e) === "center" && before === dock.dragged) {
          dock.drag(null);
          setDrop(null);
          return;
        }
        dock.move(
          dock.dragged,
          group.id,
          chooseSide(e),
          before === dock.dragged ? undefined : before,
        );
        setDrop(null);
      }}
    >
      <div className="sketch-work-tabs">
        <div
          role="tablist"
          aria-label={`Tabs in ${dock.label(tab)} pane`}
          className="sketch-tabstrip sketch-document-strip"
          onKeyDown={tabKeys}
        >
          {group.tabs.map((id) => (
            <div className="sketch-document-tab" data-tab={id} key={id}>
              <Button
                id={`dock-tab-${group.id}-${id}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("application/x-lmbook-tab", id);
                  dock.drag(id);
                }}
                onDragEnd={() => {
                  dock.drag(null);
                  setDrop(null);
                }}
                role="tab"
                aria-controls={`dock-panel-${group.id}`}
                aria-selected={id === tab}
                tabIndex={id === tab ? 0 : -1}
                title={
                  id.startsWith("note:")
                    ? base.state.notes.find((n) => n.id === id.slice(5))?.path
                    : "Drag to move this view"
                }
                onClick={() => dock.activate(group.id, id)}
              >
                <GripVertical
                  size={12}
                  className="dock-tab-grip"
                  aria-hidden="true"
                />
                <span>
                  {dock.label(id)}
                  {base.state.drafts[id.slice(5)] !== undefined &&
                  id.startsWith("note:")
                    ? " •"
                    : ""}
                </span>
              </Button>
              <Button
                className="sketch-close-tab"
                aria-label={`Close ${dock.label(id)} tab`}
                onClick={() => dock.close(group.id, id)}
              >
                <X size={12} />
              </Button>
            </div>
          ))}
          {!group.tabs.length && (
            <span className="dock-empty-tab">Empty pane</span>
          )}
        </div>
        <Button
          className="dock-pane-options"
          aria-label={`Pane options: ${dock.label(tab)}`}
          aria-haspopup="true"
          onClick={showMenu}
        >
          <Plus size={16} />
        </Button>
        <div className="dock-menu" popover="auto" ref={menu}>
          <strong>Open or move a view here</strong>
          <div className="dock-menu-views">
            {Object.entries(names).map(([id, name]) => (
              <Button
                key={id}
                onClick={() => action(() => dock.open(id, group.id))}
              >
                {name}
              </Button>
            ))}
          </div>
          <strong>Split this pane</strong>
          <div className="dock-menu-grid">
            {(
              [
                ["left", "Left"],
                ["right", "Right"],
                ["top", "Above"],
                ["bottom", "Below"],
              ] as const
            ).map(([side, title]) => (
              <Button
                key={side}
                onClick={() => action(() => dock.split(group.id, side))}
              >
                {title}
              </Button>
            ))}
          </div>
          {tab && groups(dock.dock.root).length > 1 && (
            <details>
              <summary>Move “{dock.label(tab)}” to…</summary>
              {groups(dock.dock.root)
                .filter((g) => g.id !== group.id)
                .map((g, i) => (
                  <Button
                    key={g.id}
                    onClick={() => action(() => dock.move(tab, g.id))}
                  >
                    Pane {i + 1} · {dock.label(g.active)}
                  </Button>
                ))}
            </details>
          )}
          <hr />
          <Button
            disabled={!dock.dock.closed.length}
            onClick={() =>
              action(() => dock.open(dock.dock.closed.at(-1)!, group.id))
            }
          >
            <Undo2 size={14} />
            Reopen last closed tab
          </Button>
          <Button onClick={() => action(() => dock.maximize(group.id))}>
            {dock.maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{" "}
            {dock.maximized ? "Show all panes" : "Focus this pane"}
          </Button>
          <Button onClick={() => action(() => dock.closePane(group.id))}>
            <X size={14} />
            Close pane
          </Button>
        </div>
      </div>
      <div
        className="sketch-pane-body"
        role="tabpanel"
        id={`dock-panel-${group.id}`}
        aria-labelledby={tab ? `dock-tab-${group.id}-${tab}` : undefined}
        tabIndex={0}
      >
        <LabViewScope value={scope}>{content}</LabViewScope>
      </div>
      {isMaterial && (
        <div className="sketch-pane-foot">
          {base.state.sourceIds.length} sources in chat{" "}
          <Button onClick={() => dock.open("chat")}>Open chat</Button>
        </div>
      )}
      {dock.dragged && drop && (
        <div
          className={`dock-drop-preview dock-drop-${drop}`}
          aria-hidden="true"
        >
          <span>
            {drop === "center"
              ? "Release to group tabs"
              : `Release to place ${drop === "top" ? "above" : drop === "bottom" ? "below" : `on the ${drop}`}`}
          </span>
        </div>
      )}
    </section>
  );
}
