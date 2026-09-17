import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createFixtureState,
  directions,
  initialView as fixtureView,
} from "./fixtures";
import type {
  Job,
  LabContextValue,
  LabState,
  Suggestion,
  Task,
  ViewState,
} from "./types";

export { directions };
const STORAGE_KEY = "lmbook-ux-lab-v1";
const tasks: Task[] = ["notes", "ask", "practice", "listen", "home"];
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const statuses = ["pending", "dismissed", "applied", "stale"] as const;
const jobStatuses = ["running", "cancelled", "done", "failed"] as const;
function safeSuggestion(value: unknown): Suggestion | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.noteId !== "string" ||
    typeof value.detail !== "string" ||
    typeof value.quote !== "string" ||
    typeof value.addition !== "string" ||
    typeof value.baseRevision !== "number" ||
    !statuses.includes(value.status as (typeof statuses)[number])
  )
    return null;
  return {
    id: value.id,
    title: value.title,
    noteId: value.noteId,
    detail: value.detail,
    quote: value.quote,
    addition: value.addition,
    baseRevision: Math.max(0, value.baseRevision),
    status: value.status as Suggestion["status"],
    uncertain: value.uncertain === true,
    before: typeof value.before === "string" ? value.before : undefined,
    ...(value.replacement === true ? { replacement: true } : {}),
  } as Suggestion;
}
function safeState(
  value: unknown,
): LabState & { draftBases: Record<string, number> } {
  const fresh = createFixtureState();
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.notes) ||
    !isRecord(value.views)
  )
    return { ...fresh, draftBases: {} };
  const raw = value as Record<string, any>;
  const notes = value.notes
    .filter(
      (n) =>
        isRecord(n) &&
        typeof n.id === "string" &&
        typeof n.path === "string" &&
        typeof n.title === "string" &&
        typeof n.text === "string" &&
        Number.isFinite(n.revision),
    )
    .map((n) => ({
      id: n.id as string,
      path: n.path as string,
      title: n.title as string,
      text: n.text as string,
      revision: Math.max(0, n.revision as number),
      topic: typeof n.topic === "string" ? n.topic : "water",
      source: n.source === true,
    }));
  if (!notes.length) return { ...fresh, draftBases: {} };
  const restored = { ...fresh, notes } as LabState & {
    draftBases: Record<string, number>;
  };
  const custom = Array.isArray(value.suggestions)
    ? value.suggestions.map(safeSuggestion).filter((s): s is Suggestion => !!s)
    : [];
  // Preserve fixture identities and any user-created suggestions, while keeping malformed entries out.
  restored.suggestions = fresh.suggestions.map(
    (seed) =>
      custom.find(
        (s) => s.id === seed.id && notes.some((n) => n.id === s.noteId),
      ) ?? seed,
  );
  for (const suggestion of custom)
    if (
      notes.some((n) => n.id === suggestion.noteId) &&
      !restored.suggestions.some((s) => s.id === suggestion.id)
    )
      restored.suggestions.push(suggestion);
  restored.views = { ...fresh.views };
  for (let i = 1; i <= directions.length; i++) {
    const view = value.views[i] as Record<string, any> | undefined;
    if (
      isRecord(view) &&
      typeof view.noteId === "string" &&
      notes.some((n) => n.id === view.noteId) &&
      tasks.includes(view.task as Task)
    )
      restored.views[i] = {
        ...fresh.views[i],
        task: view.task as Task,
        noteId: view.noteId,
        tabs: Array.isArray(view.tabs)
          ? view.tabs.filter(
              (x) =>
                typeof x === "string" &&
                (notes.some((n) => n.id === x) ||
                  ["task:ask", "task:practice", "task:listen"].includes(x)),
            )
          : fresh.views[i].tabs,
        closedTabs: Array.isArray(view.closedTabs)
          ? view.closedTabs.filter(
              (x) =>
                typeof x === "string" &&
                (notes.some((n) => n.id === x) ||
                  ["task:ask", "task:practice", "task:listen"].includes(x)),
            )
          : [],
        pinned: Array.isArray(view.pinned)
          ? view.pinned.filter(
              (x) =>
                typeof x === "string" &&
                (notes.some((n) => n.id === x) ||
                  ["task:ask", "task:practice", "task:listen"].includes(x)),
            )
          : [],
        filter: typeof view.filter === "string" ? view.filter : "",
        focus: view.focus === true,
        panel: ["material", "work", "context"].includes(String(view.panel))
          ? (view.panel as ViewState["panel"])
          : "material",
        signatureOpen: view.signatureOpen === true,
        scroll: Number.isFinite(view.scroll)
          ? Math.max(0, view.scroll as number)
          : 0,
        questionLens: view.questionLens === true,
        selectedQuestion:
          typeof view.selectedQuestion === "string"
            ? view.selectedQuestion
            : "",
        compare: view.compare === true,
        materialTab: view.materialTab === "sources" ? "sources" : "notes",
        proposal: typeof view.proposal === "string" ? view.proposal : undefined,
        proposalRevision:
          typeof view.proposalRevision === "number"
            ? view.proposalRevision
            : undefined,
        pendingTitle:
          typeof view.pendingTitle === "string" ? view.pendingTitle : undefined,
        handoff:
          isRecord(view.handoff) &&
          typeof (view.handoff as any).noteId === "string" &&
          notes.some((n) => n.id === (view.handoff as any).noteId) &&
          typeof (view.handoff as any).text === "string"
            ? {
                noteId: (view.handoff as any).noteId,
                text: (view.handoff as any).text,
                revision: Number((view.handoff as any).revision) || 0,
              }
            : undefined,
        anchor:
          isRecord(view.anchor) &&
          typeof (view.anchor as any).noteId === "string" &&
          notes.some((n) => n.id === (view.anchor as any).noteId) &&
          typeof (view.anchor as any).text === "string"
            ? {
                noteId: (view.anchor as any).noteId,
                text: (view.anchor as any).text,
                revision: Number((view.anchor as any).revision) || 0,
                scroll: Math.max(0, Number((view.anchor as any).scroll) || 0),
              }
            : undefined,
        contextPinned:
          typeof view.contextPinned === "string"
            ? view.contextPinned
            : undefined,
        contextTab: ["suggestions", "evidence", "activity"].includes(
          String(view.contextTab),
        )
          ? (view.contextTab as ViewState["contextTab"])
          : "suggestions",
        evidence:
          isRecord(view.evidence) &&
          typeof view.evidence.id === "string" &&
          typeof view.evidence.title === "string" &&
          typeof view.evidence.text === "string"
            ? {
                id: view.evidence.id,
                title: view.evidence.title,
                text: view.evidence.text,
                revision: Number(view.evidence.revision) || 0,
              }
            : undefined,
      };
  }
  restored.jobs = Array.isArray(value.jobs)
    ? value.jobs
        .filter(
          (j) =>
            isRecord(j) &&
            typeof j.id === "string" &&
            typeof j.label === "string" &&
            jobStatuses.includes(j.status as (typeof jobStatuses)[number]),
        )
        .map((j) => ({
          id: j.id as string,
          label: j.label as string,
          progress: Math.max(0, Math.min(1, Number(j.progress) || 0)),
          status:
            j.status === "running" ? "cancelled" : (j.status as Job["status"]),
        }))
    : [];
  restored.drafts = isRecord(value.drafts)
    ? (Object.fromEntries(
        Object.entries(value.drafts).filter(
          ([, text]) => typeof text === "string",
        ),
      ) as Record<string, string>)
    : {};
  restored.changedIds = Array.isArray(value.changedIds)
    ? value.changedIds.filter((x) => typeof x === "string")
    : [];
  restored.draftBases = isRecord(value.draftBases)
    ? (Object.fromEntries(
        Object.entries(value.draftBases).filter(
          ([, revision]) =>
            typeof revision === "number" && Number.isFinite(revision),
        ),
      ) as Record<string, number>)
    : Object.fromEntries(
        Object.keys(restored.drafts).map((id) => [
          id,
          restored.notes.find((n) => n.id === id)?.revision ?? 0,
        ]),
      );
  restored.direction =
    Number.isInteger(value.direction) &&
    Number(value.direction) >= 1 &&
    Number(value.direction) <= directions.length
      ? Number(value.direction)
      : 1;
  restored.notebook = value.notebook === "german" ? "german" : "water";
  restored.theme = value.theme === "dark" ? "dark" : "light";
  restored.accent = ["cobalt", "moss", "plum"].includes(String(value.accent))
    ? (value.accent as LabState["accent"])
    : "cobalt";
  restored.sourceIds = Array.isArray(value.sourceIds)
    ? value.sourceIds.filter((x) => typeof x === "string")
    : fresh.sourceIds;
  if (Array.isArray(value.pairs))
    restored.pairs = value.pairs
      .filter(
        (p) =>
          isRecord(p) &&
          typeof p.id === "string" &&
          typeof p.german === "string" &&
          typeof p.dutch === "string",
      )
      .map((p) => ({
        id: p.id as string,
        german: p.german as string,
        dutch: p.dutch as string,
        generated: p.generated === true,
        reviewed: p.reviewed === true,
      }));
  if (isRecord(value.practice))
    restored.practice = {
      index: Math.max(0, Number(value.practice.index) || 0),
      reverse: value.practice.reverse === true,
      typing: value.practice.typing === true,
      revealed: value.practice.revealed === true,
      answer:
        typeof value.practice.answer === "string" ? value.practice.answer : "",
      feedback:
        typeof value.practice.feedback === "string"
          ? value.practice.feedback
          : "",
      editing: value.practice.editing === true,
    };
  if (isRecord(value.model))
    restored.model = {
      downloaded: value.model.downloaded === true,
      checked: value.model.checked === true,
      enabled: value.model.enabled === true,
      indexed: value.model.indexed === true,
    };
  restored.question =
    typeof value.question === "string" ? value.question : fresh.question;
  if (Array.isArray(value.messages))
    restored.messages = value.messages
      .filter(
        (m) =>
          isRecord(m) &&
          typeof m.id === "string" &&
          typeof m.question === "string" &&
          typeof m.answer === "string" &&
          Array.isArray(m.sources),
      )
      .map((m) => ({
        id: m.id as string,
        question: m.question as string,
        answer: m.answer as string,
        sources: (m.sources as any[])
          .filter(
            (s: any) =>
              isRecord(s) &&
              typeof s.id === "string" &&
              typeof s.title === "string" &&
              typeof s.text === "string",
          )
          .map((s: any) => ({
            id: s.id as string,
            title: s.title as string,
            text: s.text as string,
            revision: Number(s.revision) || 0,
          })),
      }));
  if (Array.isArray(value.history))
    restored.history = value.history
      .filter(
        (h) =>
          isRecord(h) &&
          typeof h.id === "string" &&
          typeof h.text === "string" &&
          typeof h.time === "string",
      )
      .map((h) => ({
        id: h.id as string,
        text: h.text as string,
        time: h.time as string,
      }));
  if (Array.isArray(value.thoughts))
    restored.thoughts = value.thoughts
      .filter(
        (t) =>
          isRecord(t) &&
          typeof t.id === "string" &&
          typeof t.title === "string" &&
          typeof t.noteId === "string" &&
          notes.some((n) => n.id === t.noteId) &&
          tasks.includes(t.task as Task),
      )
      .map((t) => ({
        id: t.id as string,
        title: t.title as string,
        noteId: t.noteId as string,
        task: t.task as Task,
        sources: Array.isArray(t.sources)
          ? t.sources.filter(
              (x: unknown) =>
                typeof x === "string" && notes.some((n) => n.id === x),
            )
          : [],
        question: typeof t.question === "string" ? t.question : "",
        scroll: Number(t.scroll) || 0,
        revision: Number(t.revision) || 0,
      }));
  if (Array.isArray(raw.workingSets))
    restored.workingSets = raw.workingSets
      .filter(
        (w: unknown) =>
          isRecord(w) &&
          typeof w.id === "string" &&
          typeof w.title === "string" &&
          isRecord(w.view) &&
          tasks.includes((w.view as any).task as Task) &&
          typeof (w.view as any).noteId === "string" &&
          notes.some((n) => n.id === (w.view as any).noteId),
      )
      .map((w: any) => ({
        id: w.id as string,
        title: w.title as string,
        layout: typeof w.layout === "string" ? w.layout : undefined,
        view: { ...fresh.views[1], ...(w.view as ViewState) } as ViewState,
        revisions: isRecord(w.revisions)
          ? (Object.fromEntries(
              Object.entries(w.revisions).filter(
                ([, revision]) => typeof revision === "number",
              ),
            ) as Record<string, number>)
          : {},
      }));
  if (
    isRecord(raw.margin) &&
    typeof raw.margin.noteId === "string" &&
    notes.some((n) => n.id === raw.margin.noteId) &&
    typeof raw.margin.base === "string" &&
    typeof raw.margin.text === "string"
  )
    restored.margin = {
      noteId: raw.margin.noteId,
      base: raw.margin.base,
      text: raw.margin.text,
      baseRevision: Number(raw.margin.baseRevision) || 0,
    };
  if (isRecord(value.claim))
    restored.claim = {
      text:
        typeof value.claim.text === "string"
          ? value.claim.text
          : fresh.claim.text,
      supports: Array.isArray(value.claim.supports)
        ? value.claim.supports.filter(
            (x) => typeof x === "string" && notes.some((n) => n.id === x),
          )
        : [],
      limits: Array.isArray(value.claim.limits)
        ? value.claim.limits.filter(
            (x) => typeof x === "string" && notes.some((n) => n.id === x),
          )
        : [],
      unresolved:
        typeof value.claim.unresolved === "string"
          ? value.claim.unresolved
          : "",
      noteRevision: Number(value.claim.noteRevision) || 0,
    };
  if (
    isRecord(raw.detour) &&
    tasks.includes(raw.detour.task as Task) &&
    typeof raw.detour.noteId === "string" &&
    notes.some((n) => n.id === raw.detour.noteId)
  )
    restored.detour = {
      task: raw.detour.task as Task,
      noteId: raw.detour.noteId,
      seconds: Number(raw.detour.seconds) || 0,
      playing: raw.detour.playing === true,
      help: typeof raw.detour.help === "string" ? raw.detour.help : "",
    };
  restored.controlMode = ["ask", "obvious", "full"].includes(
    String(value.controlMode),
  )
    ? (value.controlMode as LabState["controlMode"])
    : "ask";
  restored.seenAt =
    typeof value.seenAt === "string" ? value.seenAt : fresh.seenAt;
  restored.saveFailure = value.saveFailure === true;
  restored.providerFailure = value.providerFailure === true;
  restored.imported = value.imported === true;
  if (Array.isArray(value.collections))
    restored.collections = value.collections
      .filter(
        (c: any) =>
          isRecord(c) &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          ["attached", "copied"].includes(String(c.mode)),
      )
      .map((c: any) => ({
        id: c.id as string,
        title: c.title as string,
        mode: c.mode as "attached" | "copied",
        noteIds: Array.isArray(c.noteIds)
          ? c.noteIds.filter(
              (x: unknown) =>
                typeof x === "string" && notes.some((n) => n.id === x),
            )
          : [],
      }));
  if (
    typeof value.activeCollection === "string" &&
    restored.collections?.some((c) => c.id === value.activeCollection)
  )
    restored.activeCollection = value.activeCollection;
  if (isRecord(value.audio))
    restored.audio = {
      seconds: Math.max(0, Math.min(1080, Number(value.audio.seconds) || 0)),
      playing: value.audio.playing === true,
      speed: [0.75, 1, 1.25, 1.5, 2].includes(Number(value.audio.speed))
        ? Number(value.audio.speed)
        : 1,
    };
  restored.audio.playing = false;
  return restored;
}

function readStored(): {
  state: LabState & { draftBases: Record<string, number> };
  error: boolean;
  interrupted: boolean;
} {
  try {
    const raw =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const state = raw
      ? safeState(parsed)
      : { ...createFixtureState(), draftBases: {} };
    return {
      state,
      error: false,
      interrupted:
        isRecord(parsed) &&
        Array.isArray(parsed.jobs) &&
        parsed.jobs.some((job) => isRecord(job) && job.status === "running"),
    };
  } catch {
    return {
      state: { ...createFixtureState(), draftBases: {} },
      error: true,
      interrupted: false,
    };
  }
}

const LabContext = createContext<LabContextValue | null>(null);

export function LabProvider({ children }: { children: ReactNode }) {
  const restored = useMemo(readStored, []);
  const [state, setState] = useState<LabState>(restored.state);
  const [notice, setNotice] = useState(
    restored.interrupted
      ? "A running demo job was interrupted and marked cancelled."
      : "",
  );
  const [storageError, setStorageError] = useState(restored.error);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const run = state.askRun;
    if (!run) return;
    const timer = window.setTimeout(
      () =>
        setState((prev) =>
          prev.askRun?.id !== run.id
            ? prev
            : {
                ...prev,
                askRun: undefined,
                messages: prev.providerFailure
                  ? prev.messages
                  : [...prev.messages, run],
              },
        ),
      700,
    );
    return () => clearTimeout(timer);
  }, [state.askRun?.id]);
  const persist = (value: LabState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };

  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(state), 300);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [state]);
  useEffect(() => {
    const flush = () => persist(stateRef.current);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      timers.current.forEach(clearInterval);
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!state.audio.playing) return;
    const timer = setInterval(
      () =>
        setState((prev) => {
          const seconds = prev.audio.seconds + prev.audio.speed;
          return {
            ...prev,
            audio:
              seconds >= 1080
                ? { ...prev.audio, seconds: 1080, playing: false }
                : { ...prev.audio, seconds },
          };
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [state.audio.playing, state.audio.speed]);

  const update = (fn: (value: LabState) => LabState) =>
    setState((prev) => {
      const next = fn(prev);
      const previousDrafts = prev.drafts;
      const nextDrafts = next.drafts;
      const draftBases = {
        ...((prev as LabState & { draftBases?: Record<string, number> })
          .draftBases ?? {}),
      };
      for (const [id, text] of Object.entries(nextDrafts))
        if (typeof text === "string" && !(id in previousDrafts))
          draftBases[id] =
            next.notes.find((note) => note.id === id)?.revision ?? 0;
      (next as LabState & { draftBases: Record<string, number> }).draftBases =
        draftBases;
      stateRef.current = next;
      return next;
    });
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(
      () => setNotice((current) => (current === message ? "" : current)),
      3600,
    );
  };
  const setView = (patch: Partial<ViewState>) =>
    update((prev) => ({
      ...prev,
      views: {
        ...prev.views,
        [prev.direction]: { ...prev.views[prev.direction], ...patch },
      },
    }));
  const openNote = (id: string, pin = false) =>
    update((prev) => {
      if (!prev.notes.some((note) => note.id === id)) return prev;
      const current = prev.views[prev.direction];
      const tabs = current.tabs.includes(id)
        ? current.tabs
        : [...current.tabs, id];
      return {
        ...prev,
        views: {
          ...prev.views,
          [prev.direction]: {
            ...current,
            noteId: id,
            scroll: current.noteId === id ? current.scroll : 0,
            tabs,
            pinned:
              pin && !current.pinned.includes(id)
                ? [...current.pinned, id]
                : current.pinned,
          },
        },
      };
    });
  const navigate = (task: Task) =>
    update((prev) => ({
      ...prev,
      views: {
        ...prev.views,
        [prev.direction]: {
          ...prev.views[prev.direction],
          task,
          tabs:
            [8, 11].includes(prev.direction) &&
            task !== "notes" &&
            task !== "home"
              ? [
                  ...new Set([
                    ...prev.views[prev.direction].tabs,
                    `task:${task}`,
                  ]),
                ]
              : prev.views[prev.direction].tabs,
        },
      },
    }));
  const saveNote = (id: string): boolean => {
    const current = stateRef.current;
    if (current.saveFailure) {
      notify("Save failed. Your local draft is preserved for recovery.");
      return false;
    }
    const text = current.drafts[id];
    if (typeof text !== "string") return true;
    const note = current.notes.find((n) => n.id === id);
    if (!note) return false;
    const baseRevision = (
      current as LabState & { draftBases?: Record<string, number> }
    ).draftBases?.[id];
    if (typeof baseRevision === "number" && baseRevision !== note.revision) {
      notify(
        "This note changed externally. Review the conflict before saving.",
      );
      return false;
    }
    update((prev) => {
      const next = {
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id ? { ...n, text, revision: n.revision + 1 } : n,
        ),
        drafts: Object.fromEntries(
          Object.entries(prev.drafts).filter(([key]) => key !== id),
        ),
        changedIds: prev.changedIds.includes(id)
          ? prev.changedIds
          : [...prev.changedIds, id],
        history: [
          ...prev.history,
          {
            id: `save-${id}-${Date.now()}`,
            text: `Saved ${id}`,
            time: "just now",
          },
        ],
      };
      next.draftBases = Object.fromEntries(
        Object.entries(prev.draftBases || {}).filter(([key]) => key !== id),
      );
      return next;
    });
    notify("Saved locally");
    return true;
  };
  const applySuggestion = (id: string) =>
    update((prev) => {
      const suggestion = prev.suggestions.find((s) => s.id === id);
      const target =
        suggestion && prev.notes.find((n) => n.id === suggestion.noteId);
      if (!suggestion || !target || suggestion.status !== "pending")
        return prev;
      if (prev.drafts[suggestion.noteId] !== undefined || prev.saveFailure) {
        notify(
          "Save or review the current draft before applying this suggestion.",
        );
        return prev;
      }
      if (target.revision !== suggestion.baseRevision) {
        notify("This suggestion is stale. Review the current note first.");
        return {
          ...prev,
          suggestions: prev.suggestions.map((s) =>
            s.id === id ? { ...s, status: "stale" } : s,
          ),
        };
      }
      if (suggestion.uncertain)
        notify(
          "Applied with a reminder: this finding is uncertain and needs your review.",
        );
      const replacement =
        (suggestion as Suggestion & { replacement?: boolean }).replacement ===
        true;
      const proposedText =
        replacement &&
        suggestion.before &&
        target.text.includes(suggestion.before)
          ? target.text.replace(suggestion.before, suggestion.addition)
          : target.text + suggestion.addition;
      return {
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === target.id
            ? { ...n, text: proposedText, revision: n.revision + 1 }
            : n,
        ),
        suggestions: prev.suggestions.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "applied",
                before: replacement ? suggestion.before : target.text,
              }
            : s,
        ),
        history: [
          ...prev.history,
          {
            id: `suggestion-${id}`,
            text: `Applied suggestion ${id}`,
            time: "just now",
          },
        ],
        changedIds: prev.changedIds.includes(target.id)
          ? prev.changedIds
          : [...prev.changedIds, target.id],
      };
    });
  const undoSuggestion = (id: string) =>
    update((prev) => {
      const suggestion = prev.suggestions.find((s) => s.id === id);
      if (!suggestion || suggestion.status !== "applied") return prev;
      const target = prev.notes.find((n) => n.id === suggestion.noteId);
      if (!target || !suggestion.addition) {
        notify("This change cannot be undone safely.");
        return prev;
      }
      const replacement =
        (suggestion as Suggestion & { replacement?: boolean }).replacement ===
        true;
      const occurrences = target.text.split(suggestion.addition).length - 1;
      if (occurrences !== 1) {
        notify(
          "This change has been edited or duplicated; compare before undoing.",
        );
        return prev;
      }
      const text =
        replacement && suggestion.before
          ? target.text.replace(suggestion.addition, suggestion.before)
          : target.text.replace(suggestion.addition, "");
      return {
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === target.id ? { ...n, text, revision: n.revision + 1 } : n,
        ),
        suggestions: prev.suggestions.map((s) =>
          s.id === id
            ? { ...s, status: "pending", baseRevision: target.revision + 1 }
            : s,
        ),
        history: [
          ...prev.history,
          {
            id: `undo-${id}`,
            text: `Undid suggestion ${id}`,
            time: "just now",
          },
        ],
      };
    });
  const startJob = (label: string) => {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    update((prev) => ({
      ...prev,
      jobs: [...prev.jobs, { id, label, progress: 0, status: "running" }],
    }));
    const timer = setInterval(() => {
      const prev = stateRef.current;
      const job = prev.jobs.find((j) => j.id === id);
      if (!job || job.status !== "running") {
        clearInterval(timer);
        timers.current.delete(id);
        return;
      }
      const progress = Math.min(1, job.progress + 0.2);
      const done = progress >= 1;
      const lower = label.toLowerCase();
      if (done) {
        clearInterval(timer);
        timers.current.delete(id);
      }
      update((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === id
            ? { ...j, progress, status: done ? "done" : "running" }
            : j,
        ),
        model: done
          ? {
              ...prev.model,
              downloaded: lower.includes("download")
                ? true
                : prev.model.downloaded,
              checked: lower.includes("check") ? true : prev.model.checked,
              indexed: lower.includes("index") ? true : prev.model.indexed,
            }
          : prev.model,
        history: done
          ? [
              ...prev.history,
              { id, text: `${label} completed`, time: "just now" },
            ]
          : prev.history,
      }));
    }, 500);
    timers.current.set(id, timer);
  };
  const cancelJob = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearInterval(timer);
      timers.current.delete(id);
    }
    update((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) =>
        j.id === id && j.status === "running"
          ? { ...j, status: "cancelled" }
          : j,
      ),
    }));
  };
  const reset = () => {
    timers.current.forEach(clearInterval);
    timers.current.clear();
    const next = createFixtureState();
    stateRef.current = next;
    setState(next);
    setNotice("Demo state reset");
  };
  const view = fixtureView(state, state.direction);
  const value: LabContextValue = {
    state,
    update,
    view,
    setView,
    openNote,
    navigate,
    saveNote,
    applySuggestion,
    undoSuggestion,
    startJob,
    cancelJob,
    reset,
    notify,
    notice,
    storageError,
  };
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab(): LabContextValue {
  const context = useContext(LabContext);
  if (!context) throw new Error("useLab must be used inside LabProvider");
  return context;
}

/** A docked view shares notebook data while keeping its navigation local. */
export function LabViewScope({
  value,
  children,
}: {
  value: LabContextValue;
  children: ReactNode;
}) {
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export default LabProvider;
