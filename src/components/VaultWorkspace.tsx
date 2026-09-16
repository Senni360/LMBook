import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FolderOpen,
  FileText,
  Plus,
  RefreshCw,
  Save,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  History,
  X,
  Check,
  LoaderCircle,
  PanelLeft,
  BookOpen,
  Pencil,
  Search,
  List,
  Copy,
  FolderPlus,
  Settings2,
} from "lucide-react";
import type {
  Vault,
  VaultNote,
  VaultDraft,
  VaultIndex,
  VaultSearchResult,
} from "../../shared/vault";
import type {
  VaultStorageInventory,
  VaultStorageCategory,
} from "../../shared/vault-recovery";
import type { VaultLearningImportResult } from "../../shared/vault-learning";
import {
  inspectVaultMarkdown,
  createVaultLinkResolver,
} from "../../shared/vault-markdown";
import { InkButton, InkInput, InkSelect, InkStroke } from "./InkControl";
import { confirmInk } from "./InkDialog";
import type { VaultEditorHandle } from "./vault/VaultEditor";
const VaultEditor = lazy(() =>
  import("./vault/VaultEditor").then((module) => ({
    default: module.VaultEditor,
  })),
);
import { VaultMarkdown } from "./vault/VaultMarkdown";
import { VaultNavigator } from "./vault/VaultNavigator";
import { VaultLearningPanel } from "./vault/VaultLearningPanel";
import { VaultQuickSwitcher } from "./vault/VaultQuickSwitcher";
import { useVaultSemantic } from "./vault/useVaultSemantic";
import {
  VaultDraftStore,
  type Editor,
  type RecoveryMetadata,
} from "./vault/vault-drafts";
import "./vault-workspace.css";
import { useWorkspacePanes } from "./WorkspaceResizer";
import { VaultIndexPanel } from "./vault/VaultIndexPanel";

async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${url}`, {
    method,
    headers: { "Content-Type": "application/json", "x-sennibook": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "The vault could not be reached."),
      { status: response.status },
    );
  return result;
}
type Preferences = {
  savePaths: Record<string, string>;
  vaultId: string;
  selected: string[];
  favorites: string[];
  recent: string[];
  tabs: string[];
  activePath: string | null;
  mode: "read" | "edit";
  pane: "learning" | "context" | null;
};
type Recovery = { id: string; createdAt: string; reason: string };
type NoteContext = {
  backlinks: { path: string; label: string; line: number }[];
};
type Drift = {
  path: string;
  status: "unchanged" | "changed" | "missing";
  issue?: string;
};
function readPreferences(id: string): Preferences {
  const fallback: Preferences = {
    savePaths: {},
    vaultId: id,
    selected: [],
    favorites: [],
    recent: [],
    tabs: [],
    activePath: null,
    mode: "read",
    pane: null,
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem(`lmbook:vault-workspace:${id}`) || "null",
    );
    if (!saved || typeof saved !== "object") return fallback;
    if (saved.savePaths && typeof saved.savePaths === "object")
      fallback.savePaths = Object.fromEntries(
        Object.entries(saved.savePaths)
          .filter(
            ([key, value]) =>
              key.length <= 500 &&
              typeof value === "string" &&
              value.length <= 500,
          )
          .slice(-50),
      ) as Record<string, string>;
    for (const key of ["selected", "favorites", "recent", "tabs"] as const)
      if (Array.isArray(saved[key]))
        fallback[key] = saved[key]
          .filter((p: unknown) => typeof p === "string")
          .slice(0, key === "selected" ? 150 : key === "favorites" ? 1000 : 30);
    if (typeof saved.activePath === "string")
      fallback.activePath = saved.activePath;
    if (saved.mode === "edit") fallback.mode = "edit";
    if (saved.pane === "context" || saved.pane === "learning")
      fallback.pane = saved.pane;
  } catch {}
  return fallback;
}
const emptyIndex = (): VaultIndex => ({
  files: [],
  folders: [],
  assets: [],
  status: {
    running: false,
    completed: 0,
    total: 0,
    updatedAt: null,
    warnings: [],
  },
});
const basename = (path: string) =>
  path.split("/").at(-1)?.replace(/\.md$/i, "") || path;
const dirname = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const bytesLabel = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
const dateLabel = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function VaultWorkspace({
  active,
  notebooks,
  currentNotebook,
  onSourcesAdded,
  onOpenNotebook,
  openRequest,
  forcedVault,
  inventoryRevision,
  workspaceTitle,
  learningContent,
  onNoteSaved,
}: {
  forcedVault?: Vault;
  inventoryRevision?: number;
  workspaceTitle?: string;
  learningContent?: ReactNode;
  onNoteSaved?: () => Promise<void>;
  active: boolean;
  openRequest?: { vaultId: string; path: string; nonce: number } | null;
  notebooks: {
    id: string;
    title: string;
    subject?: string;
    example?: boolean;
  }[];
  currentNotebook: string | null;
  onSourcesAdded: (id: string) => Promise<void>;
  onOpenNotebook: (
    id: string,
    section?: "sources" | "chat" | "flashcards" | "studio",
  ) => Promise<void>;
}) {
  const deskRef = useRef<HTMLDivElement>(null);
  const panes = useWorkspacePanes(forcedVault?.id || "vault", deskRef);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultId, setVaultId] = useState("");
  const semantic = useVaultSemantic(vaultId || "");
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences(""));
  const [index, setIndex] = useState<VaultIndex>(emptyIndex);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [conflict, setConflict] = useState<VaultNote | null>(null);
  const [missing, setMissing] = useState(false);
  const [anchor, setAnchor] = useState<string>();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<VaultSearchResult[]>();
  const [searchMore, setSearchMore] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [selectionTools, setSelectionTools] = useState(false);
  const [view, setView] = useState<"notes" | "drafts" | "recovery">("notes");
  const [drafts, setDrafts] = useState<VaultDraft[]>([]);
  const [moreDrafts, setMoreDrafts] = useState(false);
  const [review, setReview] = useState<VaultDraft | null>(null);
  const [drift, setDrift] = useState<Drift[]>([]);
  const [reviewSource, setReviewSource] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<RecoveryMetadata[]>([]);
  const [history, setHistory] = useState<Recovery[] | null>(null);
  const [historyText, setHistoryText] = useState<string | null>(null);
  const [context, setContext] = useState<NoteContext>({ backlinks: [] });
  const [fileName, setFileName] = useState("");
  const [folderName, setFolderName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [ready, setReady] = useState(false);
  const [loadedVault, setLoadedVault] = useState("");
  const handledOpenRequest = useRef<number | null>(null);
  const initialNoteAttempt = useRef("");
  const requestedNote = useRef(openRequest);
  requestedNote.current = openRequest;
  const [generating, setGenerating] = useState<{
    vaultId: string;
    notebookId: string;
  } | null>(null);
  const [lastImport, setLastImport] =
    useState<VaultLearningImportResult | null>(null);
  const [destination, setDestination] = useState(currentNotebook);
  const [storage, setStorage] = useState<VaultStorageInventory | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorLoaded, setEditorLoaded] = useState(false);
  useEffect(() => {
    if (prefs.mode === "edit") setEditorLoaded(true);
  }, [prefs.mode]);
  const [navigationPending, setNavigationPending] = useState(false);
  const [, rerenderDrafts] = useState(0);
  const repository = useMemo(() => new VaultDraftStore(), []);
  const serial = useRef(0);
  const saving = useRef(false);
  const navigating = useRef(false);
  const latest = useRef({ vaultId, editor, active, prefs });
  latest.current = { vaultId, editor, active, prefs };
  const editorRef = useRef<VaultEditorHandle>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const folderDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (folderName === null) return;
    const element = folderDialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [folderName !== null]);
  const navigation = useRef<{
    entries: { path: string; anchor?: string }[];
    position: number;
  }>({ entries: [], position: -1 });
  const vault = vaults.find((v) => v.id === vaultId);
  const dirty = !!editor && (!editor.base || editor.text !== editor.base.text);
  const selected = prefs.vaultId === vaultId ? prefs.selected : [];
  const files = index.files;
  const allFiles = useMemo(
    () => [...files, ...index.assets],
    [files, index.assets],
  );
  const inspection = useMemo(
    () => (editor ? inspectVaultMarkdown(editor.text) : null),
    [editor?.text],
  );
  const resolveLink = useMemo(
    () => createVaultLinkResolver(allFiles),
    [allFiles],
  );
  const pendingPaths = useMemo(
    () => [
      ...new Set([
        ...recovery.map((d) => d.path),
        ...(dirty && editor ? [editor.path] : []),
      ]),
    ],
    [recovery, dirty, editor?.path],
  );
  const generated = review && editor?.generated === review.id ? review : null;

  function assignEditor(next: Editor | null) {
    latest.current.editor = next;
    setEditor(next);
  }
  function changePrefs(
    update: Partial<Preferences> | ((p: Preferences) => Preferences),
  ) {
    setPrefs((previous) =>
      typeof update === "function"
        ? update(previous)
        : { ...previous, ...update },
    );
  }
  function remember(next: Editor) {
    assignEditor(next);
    repository.remember(vaultId, next);
    setRecovery((previous) =>
      next.base && next.text === next.base.text
        ? previous.filter((d) => d.path !== next.path)
        : previous.some((d) => d.path === next.path)
          ? previous
          : [
              ...previous,
              {
                path: next.path,
                updatedAt: new Date().toISOString(),
                bytes: new TextEncoder().encode(next.text).length,
                version: 0,
                ...(next.generated ? { generated: next.generated } : {}),
              },
            ],
    );
  }
  function beginNavigation() {
    if (saving.current || navigating.current) return false;
    navigating.current = true;
    setNavigationPending(true);
    return true;
  }
  function endNavigation() {
    navigating.current = false;
    setNavigationPending(false);
  }
  async function nextFrame() {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  }
  async function flushRecovery() {
    // Let the read-only transition commit before flushing, then make one
    // second pass for a final editor event queued during the first pass.
    await nextFrame();
    await repository.flush();
    if (repository.hasPending) await repository.flush();
  }
  async function flushForNavigation() {
    await flushRecovery();
    if (repository.hasPending) {
      setError(
        "Your latest changes could not be stored for recovery. Save or copy the note before leaving it.",
      );
      return false;
    }
    return true;
  }
  async function run(label: string, action: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setBusy("");
    }
  }
  async function loadIndex(id: string, refresh = false) {
    const result = await request<VaultIndex>(
      `/vaults/${id}/index`,
      refresh ? "POST" : "GET",
    );
    if (latest.current.vaultId === id) setIndex(result);
    return result;
  }
  async function loadRecovery(id: string) {
    const rows = await repository.list(id);
    if (latest.current.vaultId === id) setRecovery(rows);
  }
  async function loadDrafts(id: string, offset = 0) {
    const rows = await request<VaultDraft[]>(
      `/vaults/${id}/drafts?offset=${offset}`,
    );
    if (latest.current.vaultId === id) {
      setDrafts((previous) => (offset ? [...previous, ...rows] : rows));
      setMoreDrafts(rows.length === 20);
    }
  }
  useEffect(() => {
    const unsubscribe = repository.subscribe((event) => {
      rerenderDrafts((value) => value + 1);
      if (event.status === "error")
        setError(
          event.error ||
            "Recovery storage is unavailable. Keep your note open.",
        );
    });
    return () => {
      unsubscribe();
    };
  }, [repository]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (repository.hasPending) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      repository.dispose();
    };
  }, [repository]);
  useEffect(() => {
    let cancelled = false;
    void request<Vault[]>("/vaults")
      .then((rows) => {
        if (cancelled) return;
        setVaults(rows);
        let last = "";
        try {
          last = localStorage.getItem("lmbook:last-vault") || "";
        } catch {}
        setVaultId(
          forcedVault?.id ||
            (rows.some((v) => v.id === last) ? last : rows[0]?.id || ""),
        );
        setReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error.message);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    ++serial.current;
    setLoadedVault("");
    assignEditor(null);
    setIndex(emptyIndex());
    setRecovery([]);
    setDrafts([]);
    setReview(null);
    setConflict(null);
    setHistory(null);
    setHistoryText(null);
    setSearch("");
    setError("");
    setNotice("");
    setLastImport(null);
    setStorage(null);
    setMissing(false);
    setView("notes");
    navigation.current = { entries: [], position: -1 };
    const saved = readPreferences(vaultId);
    if (learningContent && !saved.pane) saved.pane = "learning";
    setPrefs(saved);
    if (!vaultId) return;
    try {
      localStorage.setItem("lmbook:last-vault", vaultId);
    } catch {}
    void Promise.all([
      loadIndex(vaultId),
      loadRecovery(vaultId),
      loadDrafts(vaultId),
    ])
      .then(([loadedIndex]) => {
        if (!cancelled) {
          setLoadedVault(vaultId);
          if (saved.activePath && requestedNote.current?.vaultId !== vaultId)
            void openNote(saved.activePath, undefined, true);
          else if (
            forcedVault &&
            !saved.activePath &&
            loadedIndex.files.length &&
            requestedNote.current?.vaultId !== vaultId
          )
            void openNote(loadedIndex.files[0].path, undefined, true);
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultId]);
  useEffect(() => {
    if (!vaultId || !inventoryRevision) return;
    void loadIndex(vaultId, true).catch((reason) =>
      setError((reason as Error).message),
    );
  }, [vaultId, inventoryRevision]);
  useEffect(() => {
    // The initial inventory can arrive empty while its background scan runs.
    // Open the first note when that scan finishes, as well as for cached lists.
    if (
      !forcedVault ||
      !active ||
      loadedVault !== vaultId ||
      editor ||
      index.status.running ||
      !index.files.length ||
      busy ||
      navigationPending ||
      prefs.activePath ||
      requestedNote.current?.vaultId === vaultId ||
      initialNoteAttempt.current === vaultId
    )
      return;
    initialNoteAttempt.current = vaultId;
    void openNote(index.files[0].path, undefined, true);
  }, [
    forcedVault,
    active,
    loadedVault,
    vaultId,
    editor,
    index,
    busy,
    navigationPending,
    prefs.activePath,
  ]);
  useEffect(() => {
    if (
      !active ||
      !ready ||
      !openRequest ||
      handledOpenRequest.current === openRequest.nonce ||
      saving.current ||
      navigating.current
    )
      return;
    if (!vaults.some((item) => item.id === openRequest.vaultId)) {
      handledOpenRequest.current = openRequest.nonce;
      setError(
        "This vault is no longer connected. Connect its folder to open the original note.",
      );
      return;
    }
    if (vaultId !== openRequest.vaultId) {
      void switchVault(openRequest.vaultId);
      return;
    }
    if (loadedVault !== vaultId) return;
    handledOpenRequest.current = openRequest.nonce;
    setView("notes");
    if (!learningContent) changePrefs({ pane: null });
    void openNote(openRequest.path);
  }, [
    active,
    ready,
    openRequest,
    vaultId,
    loadedVault,
    vaults,
    busy,
    navigationPending,
  ]);
  useEffect(() => {
    if (vaultId && prefs.vaultId === vaultId)
      try {
        localStorage.setItem(
          `lmbook:vault-workspace:${vaultId}`,
          JSON.stringify(prefs),
        );
      } catch {}
  }, [prefs, vaultId]);
  useEffect(() => {
    if (!active || !vaultId) return;
    let cancelled = false,
      pending = false;
    async function check(force = false) {
      if (pending || document.hidden || saving.current || navigating.current)
        return;
      pending = true;
      try {
        if (force || index.status.running) await loadIndex(vaultId);
        const current = latest.current.editor;
        if (!current?.base) return;
        const note = await request<VaultNote>(
          `/vaults/${vaultId}/note?path=${encodeURIComponent(current.path)}`,
        );
        if (
          cancelled ||
          latest.current.vaultId !== vaultId ||
          latest.current.editor?.path !== note.path ||
          saving.current ||
          navigating.current
        )
          return;
        setMissing(false);
        const now = latest.current.editor;
        if (note.revision !== now.base?.revision) {
          if (now.base && now.text === now.base.text) {
            assignEditor({ ...now, text: note.text, base: note });
            setConflict(null);
            setNotice("Updated from the vault.");
          } else
            setConflict((previous) =>
              previous?.revision === note.revision ? previous : note,
            );
        }
      } catch (error) {
        if (!cancelled && (error as { status?: number }).status === 404)
          setMissing(true);
      } finally {
        pending = false;
      }
    }
    const timer = setInterval(
      () => void check(),
      index.status.running ? 1200 : 4000,
    );
    const focus = () => void check(true);
    window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [active, vaultId, index.status.running]);
  useEffect(() => {
    if (!vaultId || !search.trim()) {
      setResults(undefined);
      setSearchMore(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void request<{ results: VaultSearchResult[]; more: boolean }>(
        `/vaults/${vaultId}/search?q=${encodeURIComponent(search)}`,
      )
        .then((result) => {
          if (!cancelled) {
            setResults(result.results);
            setSearchMore(result.more);
          }
        })
        .catch((error) => {
          if (!cancelled) setError(error.message);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vaultId, search, index.status.completed]);
  useEffect(() => {
    setContext({ backlinks: [] });
    if (!vaultId || !editor?.path || !editor.base) return;
    let cancelled = false;
    void request<NoteContext>(
      `/vaults/${vaultId}/context?path=${encodeURIComponent(editor.path)}`,
    )
      .then((value) => {
        if (!cancelled) setContext(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vaultId, editor?.path, index.status.updatedAt]);
  useEffect(() => {
    setReview(null);
    setDrift([]);
    setReviewSource(null);
    if (!vaultId || !editor?.generated) return;
    let cancelled = false;
    void request<VaultDraft>(`/vaults/${vaultId}/drafts/${editor.generated}`)
      .then((draft) => {
        if (!cancelled) setReview(draft);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultId, editor?.generated]);
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "o" &&
        vaultId
      ) {
        event.preventDefault();
        setQuickOpen(true);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        editor
      ) {
        event.preventDefault();
        void save();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "e" &&
        editor
      ) {
        event.preventDefault();
        changePrefs({ mode: prefs.mode === "read" ? "edit" : "read" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, vaultId, editor, prefs.mode]);

  async function openNote(
    path: string,
    targetAnchor?: string,
    restoring = false,
    historyMove = false,
    heldNavigation = false,
  ) {
    const ownsNavigation = heldNavigation || beginNavigation();
    if (!ownsNavigation) return;
    const id = vaultId,
      token = ++serial.current;
    setError("");
    try {
      if (!(await flushForNavigation())) return;
      if (saving.current) return;
      let readIssue = "";
      const [saved, recovered] = await Promise.all([
        request<VaultNote>(
          `/vaults/${id}/note?path=${encodeURIComponent(path)}`,
        ).catch((error) => {
          readIssue = error.message;
          return null;
        }),
        repository.load(id, path),
      ]);
      if (token !== serial.current || latest.current.vaultId !== id) return;
      // A saved file may already contain the draft after a failed recovery cleanup.
      const draft =
        recovered && saved?.text !== recovered.text ? recovered : null;
      if (recovered && !draft) {
        // Do not clear a recovery record that was refreshed while the file was
        // loading. The next open must still be able to recover that text.
        const current = latest.current.editor;
        const changedWhileLoading =
          current?.path === path && current.text !== recovered.text;
        if (!changedWhileLoading)
          await repository.remove(id, path).catch(() => {});
        if (token !== serial.current || latest.current.vaultId !== id) return;
        void loadRecovery(id);
      }
      const next: Editor | null =
        draft || (saved ? { path, text: saved.text, base: saved } : null);
      if (!next)
        throw new Error(
          readIssue ||
            `“${path}” is no longer available. Refresh the vault or open a recovery draft.`,
        );
      // A final CodeMirror transaction can arrive while the note request is
      // in flight. Keep that recovery write durable before replacing the view.
      if (!(await flushForNavigation())) return;
      if (token !== serial.current || latest.current.vaultId !== id) return;
      assignEditor(next);
      setFileName(latest.current.prefs.savePaths[path] || path);
      setAnchor(targetAnchor);
      setHistory(null);
      setHistoryText(null);
      setMissing(!saved && !!next.base);
      setConflict(
        saved && next.base?.revision !== saved.revision ? saved : null,
      );
      if (!historyMove) {
        const nav = navigation.current;
        if (
          nav.entries[nav.position]?.path !== path ||
          nav.entries[nav.position]?.anchor !== targetAnchor
        ) {
          nav.entries = [
            ...nav.entries.slice(0, nav.position + 1),
            { path, anchor: targetAnchor },
          ].slice(-60);
          nav.position = nav.entries.length - 1;
        }
      }
      changePrefs((previous) => ({
        ...previous,
        activePath: path,
        tabs: [...new Set([...previous.tabs, path])].slice(-12),
        recent: [path, ...previous.recent.filter((p) => p !== path)].slice(
          0,
          30,
        ),
        mode: targetAnchor ? "read" : previous.mode,
      }));
      if (window.matchMedia("(max-width: 760px)").matches) {
        setNavigatorOpen(false);
        changePrefs({ pane: null });
      }
      setNotice(
        draft
          ? readIssue
            ? `Unfinished draft recovered. The vault file cannot be read: ${readIssue} Save a separate copy to keep your changes.`
            : "Unfinished draft recovered. Save to update the vault file."
          : "",
      );
      if (!restoring)
        requestAnimationFrame(() => {
          if (latest.current.prefs.mode === "edit" && !targetAnchor)
            editorRef.current?.focus();
          else readingRef.current?.focus({ preventScroll: true });
        });
    } catch (error) {
      if (token === serial.current) setError((error as Error).message);
    } finally {
      if (!heldNavigation) endNavigation();
    }
  }
  async function goBack(delta: number) {
    const next = navigation.current.position + delta,
      item = navigation.current.entries[next];
    if (!item) return;
    await openNote(item.path, item.anchor, false, true);
    if (latest.current.editor?.path === item.path) {
      navigation.current.position = next;
      rerenderDrafts((v) => v + 1);
    }
  }
  async function switchVault(id: string) {
    if (!beginNavigation()) return;
    try {
      if (await flushForNavigation()) {
        ++serial.current;
        latest.current.vaultId = id;
        setVaultId(id);
      }
    } finally {
      endNavigation();
    }
  }
  async function connect() {
    if (!beginNavigation()) return;
    try {
      if (!(await flushForNavigation())) return;
      await run("Choosing folder", async () => {
        const chosen = await window.sennibookDesktop?.chooseVault();
        if (!chosen) return;
        setVaults(await request<Vault[]>("/vaults"));
        if (chosen.id === vaultId) await loadIndex(vaultId, true);
        else {
          latest.current.vaultId = chosen.id;
          setVaultId(chosen.id);
        }
      });
    } finally {
      endNavigation();
    }
  }
  async function locateVault() {
    if (!vault || !beginNavigation()) return;
    try {
      if (!(await flushForNavigation())) return;
      if (
        !(await confirmInk(
          `Choose the new location of “${vault.name}”. Select the same vault after moving it, so existing note paths and recovery copies stay connected. Connecting a different vault here would associate those paths with different files.`,
          "Locate moved vault",
          "Choose its new folder",
        ))
      )
        return;
      await run("Locating vault", async () => {
        const chosen = await window.sennibookDesktop?.chooseVault(vaultId);
        if (!chosen) return;
        setVaults(await request<Vault[]>("/vaults"));
        await loadIndex(vaultId, true);
        setNotice(
          "Vault location updated. Existing drafts and learning source links have been kept.",
        );
        setSettingsOpen(false);
      });
    } finally {
      endNavigation();
    }
  }
  function unusedPath(wanted: string) {
    const used = new Set([
      ...files.map((f) => f.path.toLocaleLowerCase()),
      ...recovery.map((d) => d.path.toLocaleLowerCase()),
    ]);
    let candidate = wanted,
      suffix = 2;
    while (used.has(candidate.toLocaleLowerCase()))
      candidate = wanted.replace(/\.md$/i, "") + ` ${suffix++}.md`;
    return candidate;
  }
  async function newNote(
    folder = "",
    wanted = "Untitled.md",
    draft?: VaultDraft,
  ) {
    if (!beginNavigation()) return;
    try {
      if (saving.current || !(await flushForNavigation()) || saving.current)
        return;
      ++serial.current;
      const path = unusedPath((folder ? folder + "/" : "") + wanted);
      const next: Editor = {
        path,
        text: draft?.markdown || "",
        base: null,
        ...(draft ? { generated: draft.id } : {}),
      };
      remember(next);
      setFileName(path);
      setConflict(null);
      setHistory(null);
      setHistoryText(null);
      setMissing(false);
      setAnchor(undefined);
      changePrefs((previous) => ({
        ...previous,
        activePath: path,
        tabs: [...new Set([...previous.tabs, path])].slice(-12),
        mode: draft ? "read" : "edit",
      }));
      if (window.matchMedia("(max-width: 760px)").matches) {
        setNavigatorOpen(false);
        changePrefs({ pane: null });
      }
      setNotice(
        draft
          ? "Review this draft and its sources before saving a new note."
          : "New note. Choose its location, then save when ready.",
      );
    } finally {
      endNavigation();
    }
  }
  async function openGenerated(draft: VaultDraft) {
    const existing = recovery.find((item) => item.generated === draft.id);
    if (existing) {
      await openNote(existing.path);
      return;
    }
    const name =
      draft.title
        .replace(/[\\/:*?"<>|.#\x00-\x1f]/g, " ")
        .trim()
        .slice(0, 100) || "Summary";
    await newNote("", `${name}.md`, draft);
  }
  async function save() {
    if (saving.current || navigating.current) return;
    await run("Saving note", async () => {
      const submitted = latest.current.editor,
        id = latest.current.vaultId;
      if (
        !submitted ||
        (submitted.base && submitted.text === submitted.base.text)
      )
        return;
      await flushRecovery();
      if (
        latest.current.vaultId !== id ||
        latest.current.editor?.path !== submitted.path ||
        latest.current.editor?.text !== submitted.text
      ) {
        throw new Error(
          "The note changed while Save was starting. Your newer edit is still open; save again.",
        );
      }
      const target = submitted.base ? submitted.path : fileName.trim();
      if (!target) throw new Error("Choose a Markdown filename before saving.");
      if (
        target !== submitted.path &&
        recovery.some(
          (d) => d.path.toLocaleLowerCase() === target.toLocaleLowerCase(),
        )
      )
        throw new Error(
          "An unfinished draft already has that name. Choose another location.",
        );
      try {
        const note = await request<VaultNote>(`/vaults/${id}/note`, "PUT", {
          path: target,
          text: submitted.text,
          revision: submitted.base?.revision ?? null,
        });
        if (latest.current.vaultId !== id) return;
        const later = latest.current.editor;
        const hasNewerText =
          later?.path === submitted.path && later.text !== submitted.text;
        if (hasNewerText) {
          // Promote the saved snapshot to the later editor transaction and
          // persist that new base as the recovery record. This matters after
          // a reload: retaining the old null/older base would make the same
          // text look conflicted or re-submit the stale snapshot.
          remember({ ...later, path: note.path, base: note });
          setFileName(note.path);
          setConflict(null);
          setMissing(false);
          setHistory(null);
          changePrefs((previous) => ({
            ...previous,
            activePath: note.path,
            tabs: previous.tabs.map((p) =>
              p === submitted.path ? note.path : p,
            ),
            recent: [
              note.path,
              ...previous.recent.filter((p) => p !== note.path),
            ].slice(0, 30),
          }));
          setNotice(
            "Saved the version that was ready; your later edit remains open.",
          );
          if (note.path !== submitted.path)
            await repository.remove(id, submitted.path).catch(() => {
              setError(
                "The vault file was saved. Its old recovery copy could not be cleared yet; retry recovery storage before closing.",
              );
            });
        } else {
          assignEditor({
            ...submitted,
            path: note.path,
            text: note.text,
            base: note,
          });
          setFileName(note.path);
          setConflict(null);
          setMissing(false);
          setHistory(null);
          changePrefs((previous) => ({
            ...previous,
            activePath: note.path,
            tabs: previous.tabs.map((p) =>
              p === submitted.path ? note.path : p,
            ),
            recent: [
              note.path,
              ...previous.recent.filter((p) => p !== note.path),
            ].slice(0, 30),
          }));
          setNotice("Saved to the shared vault.");
          await repository.remove(id, submitted.path).catch(() => {
            setError(
              "The vault file was saved. Its old recovery copy could not be cleared yet; retry recovery storage before closing.",
            );
          });
        }
        await Promise.all([loadIndex(id, true), loadRecovery(id)]);
        await onNoteSaved?.();
      } catch (error) {
        if ((error as { status?: number }).status === 409 && submitted.base)
          setConflict(
            await request<VaultNote>(
              `/vaults/${id}/note?path=${encodeURIComponent(submitted.path)}`,
            ),
          );
        throw error;
      }
    });
  }
  async function copyCurrent(text?: string) {
    if (!beginNavigation()) return;
    try {
      if (saving.current || !(await flushForNavigation()) || saving.current)
        return;
      const current = latest.current.editor;
      const copyText = text ?? current?.text;
      if (!current || copyText === undefined) return;
      ++serial.current;
      const path = unusedPath(
        current.path.replace(/\.md$/i, "") + " (copy).md",
      );
      remember({ ...current, path, text: copyText, base: null });
      setFileName(path);
      setConflict(null);
      setMissing(false);
      setHistory(null);
      setHistoryText(null);
      changePrefs((previous) => ({
        ...previous,
        activePath: path,
        tabs: [...new Set([...previous.tabs, path])].slice(-12),
        mode: "edit",
      }));
      setNotice("A separate draft is ready. Save it to create the copy.");
    } finally {
      endNavigation();
    }
  }
  async function copyNoteText() {
    const text = latest.current.editor?.text;
    if (text === undefined) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(
        "Note text copied. You can paste it into another editor to keep a separate copy.",
      );
    } catch {
      setError(
        "Clipboard access failed. Open Edit, select the note text, and copy it with Ctrl+C or Command+C.",
      );
    }
  }
  async function discard() {
    const original = editor;
    if (
      !original ||
      !(await confirmInk(
        "Discard this unfinished edit? The version saved in your vault stays as it is.",
        "Discard draft",
        "Discard draft",
      ))
    )
      return;
    if (
      latest.current.editor !== original ||
      latest.current.vaultId !== vaultId
    ) {
      setError(
        "The note changed while the discard dialog was open. Review it before discarding again.",
      );
      return;
    }
    await run("Discarding draft", async () => {
      if (
        latest.current.editor !== original ||
        latest.current.vaultId !== vaultId
      ) {
        setError(
          "The note changed while discard was starting. Your newer edit is still open.",
        );
        return;
      }
      await flushRecovery();
      if (
        latest.current.editor !== original ||
        latest.current.vaultId !== vaultId
      ) {
        setError(
          "The note changed while discard was starting. Your newer edit is still open.",
        );
        return;
      }
      const path = original.path;
      await repository.load(vaultId, path);
      await repository.remove(vaultId, path);
      const current = await request<VaultNote>(
        `/vaults/${vaultId}/note?path=${encodeURIComponent(path)}`,
      ).catch((error) => {
        if (error.status === 404) return null;
        throw error;
      });
      if (current) {
        assignEditor({ path: current.path, text: current.text, base: current });
        setConflict(null);
      } else {
        assignEditor(null);
        changePrefs((previous) => ({
          ...previous,
          activePath: null,
          tabs: previous.tabs.filter((p) => p !== path),
        }));
      }
      await loadRecovery(vaultId);
      setNotice("Unfinished edit discarded.");
    });
  }
  async function mergeWithCurrent() {
    if (!editor || !conflict) return;
    if (
      !(await confirmInk(
        "Keep your draft text and compare it with the latest vault version below. Nothing is written until you save. The next save will replace that latest version.",
        "Review a merged version",
        "Use my draft as the starting point",
      ))
    )
      return;
    remember({ ...editor, base: conflict });
    setHistoryText(conflict.text);
    setConflict(null);
    changePrefs({ mode: "edit" });
    setNotice(
      "Edit your merged version above; the latest vault text is below for comparison.",
    );
  }
  async function summarize(book: string, prompt: string) {
    if (generating) throw new Error("A vault draft is already being written.");
    if (selected.some((p) => pendingPaths.includes(p)))
      throw new Error(
        "Save the selected notes' unfinished edits before using them for a summary.",
      );
    const id = vaultId,
      paths = [...selected];
    setGenerating({ vaultId: id, notebookId: book });
    setError("");
    try {
      const draft = await request<VaultDraft>(
        `/vaults/${id}/summarize`,
        "POST",
        { notebookId: book, paths, prompt },
      );
      if (latest.current.vaultId === id) {
        setDrafts((previous) => [draft, ...previous]);
        setNotice(
          "Your AI draft is ready in Drafts. Your open note has been kept in place.",
        );
      }
    } finally {
      setGenerating(null);
    }
  }
  function toggleSelected(path: string) {
    if (!selected.includes(path) && selected.length >= 150) {
      setError(
        "A learning selection can contain up to 150 notes. Remove a note before adding another.",
      );
      return;
    }
    changePrefs((previous) => ({
      ...previous,
      selected: previous.selected.includes(path)
        ? previous.selected.filter((p) => p !== path)
        : [...previous.selected, path].slice(0, 150),
    }));
  }
  function selectPaths(paths: string[]) {
    const combined = [...new Set([...selected, ...paths])];
    if (combined.length > 150) {
      setError(
        "A learning selection can contain up to 150 notes. Narrow the visible notes or select a smaller group.",
      );
      return;
    }
    changePrefs({ selected: combined });
  }
  async function imported(result: VaultLearningImportResult) {
    setLastImport(result);
    setDestination(result.notebookId);
    await onSourcesAdded(result.notebookId);
  }
  async function closeTab(path: string) {
    if (!beginNavigation()) return;
    try {
      if (!(await flushForNavigation())) return;
      const remaining = latest.current.prefs.tabs.filter((p) => p !== path);
      changePrefs({ tabs: remaining });
      if (latest.current.editor?.path === path) {
        if (remaining.length)
          await openNote(remaining.at(-1)!, undefined, false, false, true);
        else {
          assignEditor(null);
          changePrefs({ activePath: null });
        }
      }
    } finally {
      endNavigation();
    }
  }
  async function inspectDrift() {
    if (generated)
      await run("Checking source changes", async () =>
        setDrift(
          await request<Drift[]>(
            `/vaults/${vaultId}/drafts/${generated.id}/changes`,
          ),
        ),
      );
  }
  async function purge(category: VaultStorageCategory) {
    if (!storage) return;
    const stat =
      category === "generated" ? storage.generations : storage[category];
    if (
      !(await confirmInk(
        `Remove ${stat.count} stored ${category === "generated" ? "AI drafts" : category === "history" ? "history entries" : "search entries"} (${bytesLabel(stat.bytes)}) from LMBook? Vault files, unfinished edits and notebook sources remain available.${category === "index" ? " Search can be rebuilt from the vault." : " This cannot be undone."}`,
        "Clear local vault data",
        "Clear selected data",
      ))
    )
      return;
    await run("Clearing local data", async () => {
      await request(`/vaults/${vaultId}/storage`, "DELETE", { category });
      setStorage(
        await request<VaultStorageInventory>(`/vaults/${vaultId}/storage`),
      );
      if (category === "generated") {
        setDrafts([]);
        setReview(null);
      }
      if (category === "history") setHistory(null);
      if (category === "index") await loadIndex(vaultId);
    });
  }
  async function disconnect() {
    if (!beginNavigation()) return;
    try {
      await run("Disconnecting vault", async () => {
        if (!(await flushForNavigation())) return;
        if (
          !(await confirmInk(
            "Disconnect this folder from LMBook? Its files, notebook sources and local recovery copies will remain. Choose the same folder again to reconnect.",
            "Disconnect vault",
            "Disconnect",
          ))
        )
          return;
        const id = vaultId;
        await request(`/vaults/${id}`, "DELETE");
        const rows = await request<Vault[]>("/vaults");
        const nextId = rows[0]?.id || "";
        ++serial.current;
        setVaults(rows);
        latest.current.vaultId = nextId;
        setVaultId(nextId);
        setSettingsOpen(false);
      });
    } finally {
      endNavigation();
    }
  }

  return (
    <section
      className="vault-workspace"
      hidden={!active}
      aria-label="Obsidian workspace"
    >
      <header className="vault-header">
        <div className="vault-identity">
          <FolderOpen size={22} />
          <div>
            <h1>{workspaceTitle || (vault ? "Your vault" : "Obsidian")}</h1>
            {!vault && <p>Read, write and learn from the same notes.</p>}
          </div>
          {vault && !forcedVault && (
            <InkSelect
              aria-label="Connected vault"
              value={vaultId}
              onChange={(event) => void switchVault(event.target.value)}
              disabled={!!busy}
            >
              {vaults.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </InkSelect>
          )}
        </div>
        <div className="vault-header-actions">
          {vault && (
            <>
              <InkButton
                className="button vault-find"
                onClick={() => setQuickOpen(true)}
              >
                <Search size={15} /> Find a note{" "}
                <kbd>{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"} O</kbd>
              </InkButton>
              <InkButton
                className="icon-button"
                aria-label="Refresh vault"
                disabled={!!busy || index.status.running}
                onClick={() =>
                  void run("Refreshing vault", async () => {
                    await loadIndex(vaultId, true);
                    await onNoteSaved?.();
                  })
                }
              >
                <RefreshCw
                  size={17}
                  className={index.status.running ? "spin" : ""}
                />
              </InkButton>
              <InkButton
                className="icon-button"
                aria-label="Vault settings"
                aria-expanded={settingsOpen}
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                  if (!settingsOpen)
                    void run("Reading local storage", async () =>
                      setStorage(
                        await request<VaultStorageInventory>(
                          `/vaults/${vaultId}/storage`,
                        ),
                      ),
                    );
                }}
              >
                <Settings2 size={17} />
              </InkButton>
            </>
          )}
          {!forcedVault && (
            <InkButton
              className="button"
              onClick={() => void connect()}
              disabled={!!busy || !window.sennibookDesktop}
            >
              <Plus size={16} />
              {vault ? "Connect another" : "Connect a vault"}
            </InkButton>
          )}
        </div>
      </header>
      {vault && (
        <VaultIndexPanel
          vaultId={vaultId}
          semantic={semantic}
          onFind={() => setQuickOpen(true)}
        />
      )}
      {error && (
        <div role="alert" className="alert error vault-message">
          <span>{error}</span>
          <InkButton
            className="icon-button"
            aria-label="Dismiss vault error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </InkButton>
        </div>
      )}
      <div className="vault-live-status" role="status">
        {busy ? (
          <>
            <LoaderCircle size={14} className="spin" />
            {busy}…
          </>
        ) : (
          notice ||
          (vault
            ? "Changes are saved to the vault only when you choose Save."
            : "Connecting a folder does not send its contents to AI.")
        )}
      </div>
      {!ready ? (
        <p className="vault-loading">Opening your vault connections…</p>
      ) : !vault ? (
        <div className="vault-welcome">
          <div className="vault-welcome-mark" aria-hidden="true">
            <FileText size={44} />
            <BookOpen size={32} />
          </div>
          <h2>Your notes already have a home.</h2>
          <p>
            Connect the folder you use in Obsidian. Open and edit its Markdown
            notes, then choose the ones you want to use for learning in LMBook.
          </p>
          <ol>
            <li>
              <strong>Keep your files in place.</strong> Edits and new notes
              appear in the same vault.
            </li>
            <li>
              <strong>Choose what to learn from.</strong> Add selected notes to
              a new or existing notebook.
            </li>
            <li>
              <strong>Review before writing back.</strong> AI work starts as a
              draft with its original sources.
            </li>
          </ol>
          {!window.sennibookDesktop && (
            <p className="muted">
              Open the desktop app to connect a folder on your computer.
            </p>
          )}
          <p className="muted">
            Plugin code is not run here. Unrecognized Markdown stays in the
            file.
          </p>
        </div>
      ) : (
        <>
          {settingsOpen && (
            <section className="vault-settings" aria-label="Vault settings">
              <div className="vault-settings-title">
                <div>
                  <h2>{vault.name}</h2>
                  <p className="vault-root">{vault.root}</p>
                </div>
                <InkButton
                  className="icon-button"
                  aria-label="Close vault settings"
                  onClick={() => setSettingsOpen(false)}
                >
                  <X size={16} />
                </InkButton>
              </div>
              <p>
                Recovery copies and AI drafts stay on this computer until you
                remove them. Notebook backups contain saved learning sources,
                not your live vault or these recovery copies.
              </p>
              {storage && (
                <div className="vault-storage-list">
                  {(
                    [
                      ["history", "Save history", storage.history],
                      [
                        "generated",
                        "AI drafts and their source copies",
                        storage.generations,
                      ],
                      ["index", "Local search index", storage.index],
                    ] as const
                  ).map(([category, label, stat]) => (
                    <div key={category}>
                      <span>
                        {label}
                        <small>
                          {stat.count} items · {bytesLabel(stat.bytes)}
                        </small>
                      </span>
                      <InkButton
                        className="button small"
                        disabled={!!busy || !stat.count}
                        onClick={() => void purge(category)}
                      >
                        Clear
                      </InkButton>
                    </div>
                  ))}
                  <div>
                    <span>
                      Unfinished edits
                      <small>
                        {storage.recovery.count} notes ·{" "}
                        {bytesLabel(storage.recovery.bytes)}
                      </small>
                    </span>
                    <InkButton
                      className="button small"
                      onClick={() => {
                        setView("recovery");
                        setNavigatorOpen(true);
                        setSettingsOpen(false);
                      }}
                    >
                      Review drafts
                    </InkButton>
                  </div>
                </div>
              )}
              {!forcedVault && (
                <InkButton className="button" onClick={() => void disconnect()}>
                  Disconnect folder
                </InkButton>
              )}
              <InkButton
                className="button"
                disabled={!!busy}
                onClick={() => void locateVault()}
              >
                <FolderOpen size={15} /> Locate moved vault
              </InkButton>
            </section>
          )}
          {index.status.warnings.length > 0 && (
            <details className="vault-warnings">
              <summary>
                {index.status.warnings.length} vault notice
                {index.status.warnings.length === 1 ? "" : "s"}
              </summary>
              {index.status.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </details>
          )}
          <div className="vault-workbar">
            <div>
              <InkButton
                className={`button small ${navigatorOpen ? "active" : ""}`}
                aria-expanded={navigatorOpen}
                onClick={() => {
                  if (
                    prefs.pane &&
                    window.matchMedia("(max-width:760px)").matches
                  ) {
                    changePrefs({ pane: null });
                    setNavigatorOpen(true);
                  } else setNavigatorOpen(!navigatorOpen);
                }}
              >
                <PanelLeft size={16} /> Notes
              </InkButton>
              {learningContent && (
                <InkButton
                  className="button small"
                  onClick={() => {
                    setSelectionTools(true);
                    changePrefs({ pane: "learning" });
                  }}
                >
                  <Pencil size={14} /> Summarize
                </InkButton>
              )}
              <InkButton
                className={`button small ${view === "drafts" ? "active" : ""}`}
                onClick={() => {
                  setView(view === "drafts" ? "notes" : "drafts");
                  setNavigatorOpen(true);
                }}
              >
                <Pencil size={15} /> Drafts{" "}
                {drafts.length > 0 && (
                  <span className="vault-count">
                    {drafts.length}
                    {moreDrafts ? "+" : ""}
                  </span>
                )}
              </InkButton>
              {recovery.length > 0 && (
                <InkButton
                  className={`button small ${view === "recovery" ? "active" : ""}`}
                  onClick={() => {
                    setView(view === "recovery" ? "notes" : "recovery");
                    setNavigatorOpen(true);
                  }}
                >
                  <History size={15} /> Unfinished{" "}
                  <span className="vault-count">{recovery.length}</span>
                </InkButton>
              )}
            </div>
            <div>
              <InkButton
                className={`button small ${prefs.pane === "context" ? "active" : ""}`}
                aria-expanded={prefs.pane === "context"}
                onClick={() =>
                  changePrefs({
                    pane: prefs.pane === "context" ? null : "context",
                  })
                }
              >
                <List size={16} /> Note details
              </InkButton>
              <InkButton
                className={`button small vault-learning-toggle ${prefs.pane === "learning" ? "active" : ""}`}
                aria-expanded={prefs.pane === "learning"}
                onClick={() =>
                  changePrefs({
                    pane: prefs.pane === "learning" ? null : "learning",
                  })
                }
              >
                <BookOpen size={16} /> Learn{" "}
                {selected.length > 0 && (
                  <span className="vault-count">{selected.length}</span>
                )}
              </InkButton>
            </div>
          </div>
          <div
            ref={deskRef}
            style={panes.style}
            className={`vault-desk resizable-desk ${navigatorOpen ? "has-navigator" : ""} ${prefs.pane ? "has-pane" : ""}`}
          >
            <span
              className="workspace-frame frame-center ink-writing-surface"
              aria-hidden="true"
            >
              <InkStroke />
            </span>
            {navigatorOpen && (
              <span
                className="workspace-frame frame-left ink-writing-surface"
                aria-hidden="true"
              >
                <InkStroke />
              </span>
            )}
            {prefs.pane && (
              <span
                className="workspace-frame frame-right ink-writing-surface"
                aria-hidden="true"
              >
                <InkStroke />
              </span>
            )}
            {navigatorOpen && (
              <aside
                className="vault-navigator-region"
                aria-label={
                  view === "notes"
                    ? "Vault files"
                    : view === "drafts"
                      ? "AI drafts"
                      : "Unfinished edits"
                }
              >
                {view === "notes" ? (
                  <>
                    <VaultNavigator
                      vaultId={vaultId}
                      activePath={editor?.path || null}
                      files={files}
                      folders={index.folders}
                      selectedPaths={selected}
                      favoritePaths={prefs.favorites}
                      recentPaths={prefs.recent}
                      query={search}
                      onQueryChange={setSearch}
                      searchResults={results}
                      indexing={index.status}
                      onOpen={(path) => void openNote(path)}
                      onToggleSelected={toggleSelected}
                      onSelectPaths={selectPaths}
                      onToggleFavorite={(path) =>
                        changePrefs((previous) => ({
                          ...previous,
                          favorites: previous.favorites.includes(path)
                            ? previous.favorites.filter((p) => p !== path)
                            : [...previous.favorites, path],
                        }))
                      }
                      onNewNote={(folder) => void newNote(folder)}
                      onNewFolder={(folder) =>
                        setFolderName(folder ? folder + "/" : "")
                      }
                      onClearSelection={() => changePrefs({ selected: [] })}
                    />
                    {searchMore && (
                      <p className="vault-nav-hint">
                        Showing the first 100 matches. Refine your search to
                        find more.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="vault-draft-list">
                    <h2>
                      {view === "drafts" ? "AI drafts" : "Unfinished edits"}
                    </h2>
                    <p>
                      {view === "drafts"
                        ? "Review the writing and its sources before adding a note to your vault."
                        : "These edits are kept in LMBook. The vault files change only when you save."}
                    </p>
                    <InkButton
                      className="button small"
                      onClick={() => setView("notes")}
                    >
                      <ArrowLeft size={14} /> Back to notes
                    </InkButton>
                    {view === "drafts" ? (
                      <>
                        {generating?.vaultId === vaultId && (
                          <p role="status">
                            <LoaderCircle size={14} className="spin" /> Writing
                            a draft. You can keep working.
                          </p>
                        )}
                        {!drafts.length && !generating && (
                          <p>
                            Select notes, open Learn and choose Draft summary to
                            begin.
                          </p>
                        )}
                        {drafts.map((draft) => (
                          <InkButton
                            key={draft.id}
                            className={`vault-draft-row ${editor?.generated === draft.id ? "active" : ""}`}
                            onClick={() => void openGenerated(draft)}
                          >
                            <strong>{draft.title}</strong>
                            <small>
                              {dateLabel(draft.createdAt)} ·{" "}
                              {draft.sources.length} sources
                            </small>
                          </InkButton>
                        ))}
                        {moreDrafts && (
                          <InkButton
                            className="button small"
                            onClick={() =>
                              void run("Loading drafts", () =>
                                loadDrafts(vaultId, drafts.length),
                              )
                            }
                          >
                            Show more drafts
                          </InkButton>
                        )}
                      </>
                    ) : (
                      <>
                        {!recovery.length && (
                          <p>
                            No unfinished edits. Your saved notes are in the
                            file list.
                          </p>
                        )}
                        {recovery.map((draft) => (
                          <InkButton
                            key={draft.path}
                            className={`vault-draft-row ${editor?.path === draft.path ? "active" : ""}`}
                            onClick={() => void openNote(draft.path)}
                          >
                            <strong>{basename(draft.path)}</strong>
                            <span>{draft.path}</span>
                            <small>{dateLabel(draft.updatedAt)}</small>
                          </InkButton>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </aside>
            )}
            {navigatorOpen && panes.handle("left")}
            <div className="vault-note-region">
              {prefs.tabs.length > 0 && (
                <div className="vault-open-tabs" aria-label="Open notes">
                  {prefs.tabs.map((path) => (
                    <div
                      key={path}
                      className={editor?.path === path ? "active" : ""}
                    >
                      <InkButton
                        className="vault-open-tab"
                        aria-current={
                          editor?.path === path ? "page" : undefined
                        }
                        title={path}
                        onClick={() => void openNote(path)}
                      >
                        {pendingPaths.includes(path) && (
                          <span
                            aria-label="Unfinished edit"
                            className="vault-dirty-dot"
                          />
                        )}
                        {basename(path)}
                      </InkButton>
                      <InkButton
                        className="icon-button"
                        aria-label={`Close ${basename(path)}`}
                        onClick={() => void closeTab(path)}
                      >
                        <X size={12} />
                      </InkButton>
                    </div>
                  ))}
                </div>
              )}
              {!editor ? (
                <div className="vault-note-empty">
                  <BookOpen size={36} />
                  <h2>
                    {files.length
                      ? "Open a note. Keep its context."
                      : index.status.running
                        ? "Finding your notes…"
                        : "Start with a note."}
                  </h2>
                  <p>
                    {files.length
                      ? "Open a note from the left. Read and edit here, with learning tools beside you."
                      : "Create a Markdown note here, or add files to this folder in Obsidian."}
                  </p>
                  <div>
                    <InkButton
                      className="button"
                      onClick={() => setQuickOpen(true)}
                    >
                      <Search size={16} /> Find a note
                    </InkButton>
                    <InkButton
                      className="button"
                      onClick={() => void newNote()}
                    >
                      <Plus size={16} /> New note
                    </InkButton>
                  </div>
                  {prefs.recent.length > 0 && (
                    <div className="vault-recent-start">
                      <h3>Pick up where you left off</h3>
                      {prefs.recent.slice(0, 5).map((path) => (
                        <InkButton
                          key={path}
                          className="text-action"
                          onClick={() => void openNote(path)}
                        >
                          <FileText size={14} />
                          {path}
                        </InkButton>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="vault-note-toolbar">
                    <div className="vault-note-location">
                      <div className="vault-history-buttons">
                        <InkButton
                          className="icon-button"
                          aria-label="Previous note"
                          disabled={navigation.current.position < 1}
                          onClick={() => void goBack(-1)}
                        >
                          <ArrowLeft size={15} />
                        </InkButton>
                        <InkButton
                          className="icon-button"
                          aria-label="Next note"
                          disabled={
                            navigation.current.position >=
                            navigation.current.entries.length - 1
                          }
                          onClick={() => void goBack(1)}
                        >
                          <ArrowRight size={15} />
                        </InkButton>
                      </div>
                      <span title={editor.path}>
                        {dirname(editor.path) && (
                          <small>{dirname(editor.path)} /</small>
                        )}
                        <strong>{basename(editor.path)}</strong>
                      </span>
                    </div>
                    <div className="vault-note-controls">
                      <div className="vault-view-mode" aria-label="Note view">
                        <InkButton
                          className={prefs.mode === "read" ? "active" : ""}
                          aria-pressed={prefs.mode === "read"}
                          onClick={() => changePrefs({ mode: "read" })}
                        >
                          <BookOpen size={15} /> Read
                        </InkButton>
                        <InkButton
                          className={prefs.mode === "edit" ? "active" : ""}
                          aria-pressed={prefs.mode === "edit"}
                          onClick={() => changePrefs({ mode: "edit" })}
                        >
                          <Pencil size={15} /> Edit
                        </InkButton>
                      </div>
                      <InkButton
                        className="button primary small"
                        disabled={!!busy || !dirty || !!conflict}
                        onClick={() => void save()}
                      >
                        <Save size={15} />
                        {editor.base ? "Save" : "Save new note"}
                      </InkButton>
                    </div>
                  </div>
                  {!editor.base && (
                    <label className="vault-save-location">
                      Save as
                      <InkInput
                        value={fileName}
                        onChange={(event) => {
                          const value = event.target.value;
                          setFileName(value);
                          changePrefs((previous) => ({
                            ...previous,
                            savePaths: {
                              ...previous.savePaths,
                              [editor.path]: value,
                            },
                          }));
                        }}
                        maxLength={500}
                        placeholder="Folder/Note.md"
                        aria-label="New note path"
                      />
                      <small>
                        Use an existing folder. This creates a new file.
                      </small>
                    </label>
                  )}
                  {missing && (
                    <div className="vault-inline-warning">
                      <strong>This file cannot currently be read.</strong>
                      <p>
                        Your open text is still here. Save a separate copy or
                        reconnect the folder.
                      </p>
                      <InkButton
                        className="button small"
                        onClick={() => void copyCurrent()}
                      >
                        Keep as a new note
                      </InkButton>
                    </div>
                  )}
                  {conflict && (
                    <div className="vault-conflict">
                      <h3>The vault changed while you were editing.</h3>
                      <p>
                        Your draft has been kept. Compare the latest text before
                        deciding what to save.
                      </p>
                      <div>
                        <InkButton
                          className="button small"
                          onClick={() => void copyCurrent()}
                        >
                          Save my draft separately
                        </InkButton>
                        <InkButton
                          className="button small"
                          onClick={() => void mergeWithCurrent()}
                        >
                          Review and merge
                        </InkButton>
                        <InkButton
                          className="button small"
                          onClick={() => void discard()}
                        >
                          Use the vault version
                        </InkButton>
                      </div>
                      <details>
                        <summary>Latest vault version</summary>
                        <pre>{conflict.text}</pre>
                      </details>
                    </div>
                  )}
                  {generated && (
                    <section className="vault-generated-review">
                      <div>
                        <strong>AI draft · review before saving</strong>
                        <span>
                          {generated.sources.length} original source snapshots
                        </span>
                        <InkButton
                          className="button small"
                          onClick={() =>
                            setReviewSource(reviewSource === null ? 0 : null)
                          }
                        >
                          {reviewSource === null
                            ? "Review sources"
                            : "Hide sources"}
                        </InkButton>
                        <InkButton
                          className="button small"
                          disabled={!!busy}
                          onClick={() => void inspectDrift()}
                        >
                          Check source changes
                        </InkButton>
                      </div>
                      {drift.length > 0 && (
                        <p>
                          {drift.filter((item) => item.status !== "unchanged")
                            .length
                            ? `${drift.filter((item) => item.status !== "unchanged").length} source notes have changed or become unavailable since generation. The original snapshots are retained below.`
                            : "All source notes still match the versions used for this draft."}
                        </p>
                      )}
                      {reviewSource !== null && (
                        <div className="vault-source-review">
                          <div>
                            {generated.sources.map((source, i) => (
                              <InkButton
                                key={source.path}
                                className={`button small ${reviewSource === i ? "active" : ""}`}
                                onClick={() => setReviewSource(i)}
                              >
                                [{i + 1}] {basename(source.path)}
                              </InkButton>
                            ))}
                          </div>
                          <p>
                            {generated.sources[reviewSource]?.path}
                            <small>
                              Original snapshot ·{" "}
                              {generated.sources[reviewSource]?.revision.slice(
                                0,
                                12,
                              )}
                            </small>
                          </p>
                          <pre>{generated.sources[reviewSource]?.text}</pre>
                          <InkButton
                            className="text-action"
                            onClick={() =>
                              void openNote(
                                generated.sources[reviewSource].path,
                              )
                            }
                          >
                            Open current vault note <ArrowRight size={14} />
                          </InkButton>
                        </div>
                      )}
                    </section>
                  )}
                  <div
                    className="vault-writing-surface"
                    ref={readingRef}
                    tabIndex={-1}
                    aria-label={
                      prefs.mode === "read"
                        ? "Note reading view"
                        : "Note editing view"
                    }
                  >
                    {prefs.mode === "read" && (
                      <VaultMarkdown
                        text={editor.text}
                        notePath={editor.path}
                        vaultId={vaultId}
                        files={allFiles}
                        anchor={anchor}
                        onOpenNote={(path, anchor) =>
                          void openNote(path, anchor)
                        }
                        onMissingNote={(path) =>
                          void newNote(
                            dirname(path),
                            path.split("/").at(-1) || "Untitled.md",
                          )
                        }
                      />
                    )}
                    {(editorLoaded || prefs.mode === "edit") && (
                      <div hidden={prefs.mode !== "edit"}>
                        <Suspense
                          fallback={
                            <p className="vault-loading" role="status">
                              Opening the editor…
                            </p>
                          }
                        >
                          <VaultEditor
                            ref={editorRef}
                            documentKey={`${vaultId}:${editor.path}`}
                            value={editor.text}
                            onChange={(text) => {
                              // CodeMirror may deliver its final transaction after
                              // a parent render. Read the current editor from the
                              // ref so that transaction is retained while Save is
                              // in flight, but ignore a callback belonging to a
                              // document that has already been replaced.
                              const current = latest.current.editor;
                              if (
                                latest.current.vaultId === vaultId &&
                                current?.path === editor.path
                              )
                                remember({ ...current, text });
                            }}
                            onSave={() => void save()}
                            files={files}
                            readOnly={!!busy || navigationPending}
                            autofocus
                          />
                        </Suspense>
                      </div>
                    )}
                  </div>
                  <footer className="vault-note-footer">
                    <span>
                      {editor.text.trim()
                        ? editor.text.trim().split(/\s+/).length
                        : 0}{" "}
                      words ·{" "}
                      {dirty
                        ? repository.status(vaultId, editor.path) === "saved"
                          ? "Draft kept in LMBook"
                          : "Keeping draft…"
                        : "Saved in vault"}
                    </span>
                    <div>
                      <InkButton
                        className="text-action"
                        aria-pressed={selected.includes(editor.path)}
                        onClick={() => toggleSelected(editor.path)}
                        disabled={!editor.base}
                      >
                        {selected.includes(editor.path) ? (
                          <Check size={14} />
                        ) : (
                          <Plus size={14} />
                        )}{" "}
                        {selected.includes(editor.path)
                          ? "Selected for learning"
                          : "Select for learning"}
                      </InkButton>
                      <details className="vault-note-more">
                        <summary>More actions</summary>
                        <div>
                          <InkButton
                            className="text-action"
                            onClick={() => void copyCurrent()}
                          >
                            <Copy size={14} /> Duplicate as a draft
                          </InkButton>
                          <InkButton
                            className="text-action"
                            onClick={() => void copyNoteText()}
                          >
                            <Copy size={14} /> Copy note text
                          </InkButton>
                          <InkButton
                            className="text-action"
                            disabled={!editor.base}
                            onClick={() =>
                              void run("Opening Obsidian", async () => {
                                await window.sennibookDesktop?.openVaultInObsidian(
                                  vaultId,
                                  editor.path,
                                );
                              })
                            }
                          >
                            <ExternalLink size={14} /> Open in Obsidian
                          </InkButton>
                          <InkButton
                            className="text-action"
                            disabled={!editor.base}
                            onClick={() =>
                              void run("Showing file", async () => {
                                await window.sennibookDesktop?.revealVaultNote(
                                  vaultId,
                                  editor.path,
                                );
                              })
                            }
                          >
                            <FolderOpen size={14} /> Show in folder
                          </InkButton>
                          <InkButton
                            className="text-action"
                            onClick={() =>
                              void run("Copying path", async () => {
                                await navigator.clipboard.writeText(
                                  vault!.root + "/" + editor.path,
                                );
                                setNotice("File path copied.");
                              })
                            }
                          >
                            Copy file path
                          </InkButton>
                          <InkButton
                            className="text-action"
                            disabled={!editor.base}
                            onClick={() =>
                              void run("Reading save history", async () =>
                                setHistory(
                                  await request<Recovery[]>(
                                    `/vaults/${vaultId}/history?path=${encodeURIComponent(editor.path)}`,
                                  ),
                                ),
                              )
                            }
                          >
                            <History size={14} /> Save history
                          </InkButton>
                          <InkButton
                            className="text-action"
                            disabled={!dirty}
                            onClick={() => void discard()}
                          >
                            Discard unfinished edit
                          </InkButton>
                        </div>
                      </details>
                    </div>
                  </footer>
                  {history && (
                    <section className="vault-history">
                      <div>
                        <h3>Save history</h3>
                        <InkButton
                          className="icon-button"
                          aria-label="Close save history"
                          onClick={() => {
                            setHistory(null);
                            setHistoryText(null);
                          }}
                        >
                          <X size={16} />
                        </InkButton>
                      </div>
                      {!history.length ? (
                        <p>
                          No earlier versions have been kept for this note yet.
                        </p>
                      ) : (
                        history.map((item) => (
                          <InkButton
                            key={item.id}
                            className="button small"
                            onClick={() =>
                              void run("Reading earlier version", async () => {
                                const row = await request<{ text: string }>(
                                  `/vaults/${vaultId}/history/${item.id}`,
                                );
                                setHistoryText(row.text);
                              })
                            }
                          >
                            {dateLabel(item.createdAt)} · {item.reason}
                          </InkButton>
                        ))
                      )}
                    </section>
                  )}
                  {historyText !== null && (
                    <section className="vault-history-preview">
                      <div>
                        <h3>Comparison copy</h3>
                        <InkButton
                          className="button small"
                          onClick={() => void copyCurrent(historyText)}
                        >
                          Restore as a new draft
                        </InkButton>
                        <InkButton
                          className="icon-button"
                          aria-label="Close comparison copy"
                          onClick={() => setHistoryText(null)}
                        >
                          <X size={16} />
                        </InkButton>
                      </div>
                      <pre>{historyText}</pre>
                    </section>
                  )}
                </>
              )}
            </div>
            <>
              {prefs.pane && panes.handle("right")}
              {learningContent &&
                prefs.pane === "learning" &&
                !selectionTools && (
                  <aside
                    className="vault-side-pane notebook-learning-pane"
                    aria-label="Learning tools"
                  >
                    {learningContent}
                  </aside>
                )}
              <aside
                className="vault-side-pane"
                hidden={
                  !prefs.pane ||
                  (!!learningContent &&
                    prefs.pane === "learning" &&
                    !selectionTools)
                }
                aria-label={
                  prefs.pane === "learning"
                    ? "Learning selection"
                    : "Note details"
                }
              >
                {learningContent && selectionTools && (
                  <InkButton
                    className="button small quiet"
                    onClick={() => setSelectionTools(false)}
                  >
                    <ArrowLeft size={14} /> Back to learning tools
                  </InkButton>
                )}
                <div className="vault-pane-title">
                  <h2>
                    {prefs.pane === "learning"
                      ? "Learn from your notes"
                      : "Note details"}
                  </h2>
                  <InkButton
                    className="icon-button"
                    aria-label="Close side panel"
                    onClick={() => changePrefs({ pane: null })}
                  >
                    <X size={16} />
                  </InkButton>
                </div>
                <div hidden={prefs.pane !== "learning"}>
                  <VaultLearningPanel
                    key={vaultId}
                    vaultId={vaultId}
                    selectedPaths={selected}
                    notebooks={notebooks}
                    currentNotebook={destination || currentNotebook}
                    pendingPaths={pendingPaths}
                    onRemove={(path) =>
                      changePrefs((previous) => ({
                        ...previous,
                        selected: previous.selected.filter((p) => p !== path),
                      }))
                    }
                    onClear={() => changePrefs({ selected: [] })}
                    onImported={imported}
                    onDraftSummary={summarize}
                    generating={!!generating}
                  />
                  {generating?.vaultId === vaultId && (
                    <InkButton
                      className="button small"
                      onClick={() =>
                        void run("Cancelling generation", async () => {
                          await request(
                            `/notebooks/${generating.notebookId}/cancel`,
                            "POST",
                          );
                        })
                      }
                    >
                      Cancel draft generation
                    </InkButton>
                  )}
                  {lastImport && (
                    <div className="vault-next-learning">
                      <h3>{lastImport.title}</h3>
                      <p>Your selected notes are saved as learning sources.</p>
                      <InkButton
                        className="button primary"
                        onClick={() =>
                          void onOpenNotebook(lastImport.notebookId, "sources")
                        }
                      >
                        Open notebook <ArrowRight size={15} />
                      </InkButton>
                      <div>
                        <InkButton
                          className="text-action"
                          onClick={() =>
                            void onOpenNotebook(lastImport.notebookId, "chat")
                          }
                        >
                          Ask your sources
                        </InkButton>
                        <InkButton
                          className="text-action"
                          onClick={() =>
                            void onOpenNotebook(
                              lastImport.notebookId,
                              "flashcards",
                            )
                          }
                        >
                          Flashcards
                        </InkButton>
                        <InkButton
                          className="text-action"
                          onClick={() =>
                            void onOpenNotebook(lastImport.notebookId, "studio")
                          }
                        >
                          Audio overview
                        </InkButton>
                      </div>
                    </div>
                  )}
                </div>
                {prefs.pane === "context" &&
                  (!editor ? (
                    <p className="muted">
                      Open a note to see its outline, properties and
                      connections.
                    </p>
                  ) : (
                    <div className="vault-note-details">
                      <section>
                        <h3>Outline</h3>
                        {!inspection?.headings.length ? (
                          <p>No headings in this note.</p>
                        ) : (
                          inspection.headings.map((heading, i) => (
                            <InkButton
                              className="text-action"
                              key={`${heading.id}-${i}`}
                              style={{
                                paddingInlineStart:
                                  Math.min(heading.level - 1, 3) * 10 + 6,
                              }}
                              onClick={() => {
                                if (prefs.mode === "edit")
                                  editorRef.current?.goToLine(heading.line);
                                else setAnchor(heading.id);
                              }}
                            >
                              {heading.text}
                            </InkButton>
                          ))
                        )}
                      </section>
                      <section>
                        <h3>Properties</h3>
                        {!Object.keys(inspection?.properties || {}).length ? (
                          <p>No frontmatter properties.</p>
                        ) : (
                          <dl>
                            {Object.entries(inspection!.properties).map(
                              ([key, value]) => (
                                <div key={key}>
                                  <dt>{key}</dt>
                                  <dd>
                                    {typeof value === "string"
                                      ? value
                                      : JSON.stringify(value)}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>
                        )}
                        {!!inspection?.tags.length && (
                          <div className="vault-note-tags">
                            {inspection.tags.map((tag) => (
                              <InkButton
                                key={tag}
                                className="text-action"
                                onClick={() => {
                                  setSearch(tag);
                                  setView("notes");
                                  setNavigatorOpen(true);
                                }}
                              >
                                #{tag}
                              </InkButton>
                            ))}
                          </div>
                        )}
                      </section>
                      <section>
                        <h3>Links in this note</h3>
                        {!inspection?.links.length ? (
                          <p>No note links.</p>
                        ) : (
                          inspection.links.slice(0, 80).map((link, i) => {
                            const resolved = resolveLink(
                              link.target,
                              editor.path,
                              link.format,
                            );
                            return (
                              <div className="vault-detail-link" key={i}>
                                {resolved.kind === "note" ? (
                                  <InkButton
                                    className="text-action"
                                    onClick={() =>
                                      void openNote(
                                        resolved.path,
                                        resolved.anchor,
                                      )
                                    }
                                  >
                                    {link.label || link.target}
                                    <ArrowRight size={13} />
                                  </InkButton>
                                ) : (
                                  <span>
                                    {link.label || link.target}
                                    <small>
                                      {resolved.kind === "missing"
                                        ? "Note not found"
                                        : resolved.kind === "ambiguous"
                                          ? "Multiple matching notes"
                                          : resolved.kind === "asset"
                                            ? "Attachment"
                                            : "External link"}
                                    </small>
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </section>
                      <section>
                        <h3>Backlinks</h3>
                        {!context.backlinks.length ? (
                          <p>No indexed notes link here.</p>
                        ) : (
                          context.backlinks.map((link, i) => (
                            <InkButton
                              key={`${link.path}-${i}`}
                              className="text-action"
                              onClick={() => void openNote(link.path)}
                            >
                              {basename(link.path)}
                              <small>
                                {dirname(link.path) || "Vault root"}
                              </small>
                            </InkButton>
                          ))
                        )}
                      </section>
                    </div>
                  ))}
              </aside>
            </>
          </div>
          <VaultQuickSwitcher
            open={quickOpen}
            onClose={() => setQuickOpen(false)}
            vaultId={vaultId}
            files={files}
            recentPaths={prefs.recent}
            onOpenNote={(path) => void openNote(path)}
            onCreateNote={(name) =>
              void newNote(
                dirname(name),
                name.split("/").at(-1) || "Untitled.md",
              )
            }
            {...semantic}
          />
          {folderName !== null && (
            <dialog
              ref={folderDialog}
              className="vault-folder-form"
              aria-labelledby="vault-folder-title"
              onCancel={() => setFolderName(null)}
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("Creating folder", async () => {
                    await request(`/vaults/${vaultId}/folders`, "POST", {
                      path: folderName.trim(),
                    });
                    setFolderName(null);
                    await loadIndex(vaultId, true);
                    setNotice("Folder created in the shared vault.");
                  });
                }}
              >
                <h2 id="vault-folder-title">
                  <FolderPlus size={20} /> New folder
                </h2>
                <label>
                  Folder path
                  <InkInput
                    value={folderName}
                    onChange={(event) => setFolderName(event.target.value)}
                    autoFocus
                    placeholder="Course notes/History"
                  />
                </label>
                <p>Its parent folder must already exist.</p>
                <div>
                  <InkButton
                    className="button"
                    type="button"
                    onClick={() => setFolderName(null)}
                  >
                    Cancel
                  </InkButton>
                  <InkButton
                    className="button primary"
                    disabled={!!busy || !folderName.trim()}
                  >
                    Create folder
                  </InkButton>
                </div>
              </form>
            </dialog>
          )}
        </>
      )}
    </section>
  );
}
