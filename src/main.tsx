import { DesktopBar } from "./components/DesktopBar";
import { WorkspaceBoundary } from "./components/WorkspaceBoundary";
import { InkTooltip } from "./components/InkTooltip";
import { InkDialogHost, confirmInk } from "./components/InkDialog";
import { InkAudio } from "./components/InkAudio";
import {
  InkInput,
  InkTextarea,
  InkSelect,
  InkStroke,
  InkButton,
} from "./components/InkControl";
import React, {
  useEffect,
  useContext,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceVaultContext } from "./workspace-context";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import {
  BookOpen,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Headphones,
  FileText,
  Target,
  Settings2,
  Upload,
  X,
  Trash2,
  Search,
  Check,
  ChevronRight,
  Download,
  LoaderCircle,
  Play,
  MessageSquare,
  Send,
  ExternalLink,
  CircleAlert,
  CheckCircle2,
  Pencil,
  Library,
  Radio,
  Sparkles,
  Square,
  Bookmark,
  Volume2,
  FolderOpen,
} from "lucide-react";
import {
  type Notebook,
  type Settings,
  type Capabilities,
  type Episode,
  type Source,
  type Evidence,
  profiles,
  subjects,
  uid,
  words,
  estimateSpeech,
  settingsSchema,
} from "../shared/model";
import "./style.css";
import { evaluateEpisodeQuality } from "../shared/quality";
import { EpisodePlayer } from "./components/EpisodePlayer";
import { GoogleSetup } from "./components/GoogleSetup";
import { CartesiaSetup } from "./components/CartesiaSetup";
import { SpeechSettings } from "./components/SpeechSettings";
import {
  cartesiaCredits,
  speechSettingsSchema,
  voiceSelectionError,
} from "../shared/speech";
import { ActivityHistory } from "./components/ActivityHistory";
import { NotebookTrash } from "./components/NotebookTrash";
import { DownloadLink, DownloadProvider } from "./components/Downloads";
import { SourceAudio } from "./components/SourceAudio";
import {
  OpenRouterSetup,
  OpenRouterModelPicker,
} from "./components/OpenRouterSetup";
import {
  CodexSetup,
  FirstRunSetup,
  type OnboardingStatus,
} from "./components/CodexSetup";
import { AppearanceSetup } from "./components/AppearanceSetup";
import { initializeAppearance } from "./appearance";
import { LocalModelsSetup } from "./components/LocalModelsSetup";
import { locateEvidence, locateSourceRange } from "../shared/evidence-location";
import { ContextSummary } from "./components/ContextSummary";
import { SourceSnapshotReader } from "./components/SourceSnapshotReader";
import { SourceOcr } from "./components/SourceOcr";
import { SourceImage } from "./components/SourceImage";
import { parseEditedScript } from "../shared/script-editor";
import { useDraftText } from "./hooks/useDraftText";
import { useObjectDraft } from "./hooks/useObjectDraft";
import { version as appVersion } from "../package.json";
import { Flashcards } from "./components/Flashcards";
import {
  canAnimate,
  MotionList,
  MotionNavigation,
  MotionPreferences,
  MotionSurface,
  InkHeading,
  useCitationMotion,
  useMotionEnvironment,
} from "./components/Motion";
import "./motion.css";
import "./themes/ink.css";
import "./themes/ink-controls.css";
import "./appearance.css";
initializeAppearance();

type Summary = {
  id: string;
  title: string;
  subject: string;
  sourceCount: number;
  example: boolean;
};
const NotebookWorkspace = React.lazy(() =>
  import("./components/NotebookWorkspace").then((module) => ({
    default: module.NotebookWorkspace,
  })),
);
const VaultSourceReview = React.lazy(() =>
  import("./components/vault/VaultSourceReview").then((module) => ({
    default: module.VaultSourceReview,
  })),
);
const priceLabel = (amount: number) =>
  amount > 0 && amount < 0.01 ? "<$0.01" : `$${amount.toFixed(2)}`;
const durationLabel = (wordCount: number) =>
  wordCount < 145 ? "<1 min" : `~${Math.round(wordCount / 145)} min`;
type Tab = "sources" | "goals" | "studio" | "flashcards" | "chat" | "settings";
type SourceRequest = {
  snapshot?: Source;
  snapshotMessageId?: string;
  sourceId: string;
  quote?: string;
  startSeconds?: number;
  range?: { startOffset: number; endOffset: number };
  nonce: number;
};
type OpenSource = (
  sourceId?: string,
  quote?: string,
  startSeconds?: number,
  range?: { startOffset: number; endOffset: number },
  snapshot?: Source,
  snapshotMessageId?: string,
) => void;
async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch("/api" + url, {
    method,
    signal,
    headers: {
      ...(method !== "GET" ? { "x-sennibook": "1" } : {}),
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function Button({
  children,
  icon: Icon,
  onClick,
  variant = "",
  disabled = false,
  type = "button",
  title,
  "aria-expanded": expanded,
}: {
  children?: React.ReactNode;
  icon?: typeof Plus;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  "aria-expanded"?: boolean;
}) {
  return (
    <InkButton
      type={type}
      className={`button ${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-expanded={expanded}
    >
      {Icon && <Icon size={17} />}
      <span>{children}</span>
    </InkButton>
  );
}
function DraftNotice({
  error,
  restored,
}: {
  error?: string;
  restored?: boolean;
}) {
  if (!error && !restored) return null;
  return (
    <p className="fine-print" role="status">
      {error || "Your unsaved draft was restored."}
    </p>
  );
}
function Empty({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof Plus;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const labelId = useId();
  const hintId = `${labelId}-hint`;
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {React.Children.map(children, (child) => {
        if (
          !React.isValidElement<{
            "aria-labelledby"?: string;
            "aria-describedby"?: string;
          }>(child) ||
          !["input", "textarea", "select"].includes(String(child.type))
        )
          return child;
        return React.cloneElement(child, {
          "aria-labelledby": child.props["aria-labelledby"] || labelId,
          "aria-describedby":
            child.props["aria-describedby"] || (hint ? hintId : undefined),
        });
      })}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
function App() {
  useMotionEnvironment();
  const [notebooks, setNotebooks] = useState<Summary[]>([]);
  const [n, setN] = useState<Notebook | null>(null);
  const [tab, setTab] = useState<Tab>("sources");
  const motionTab = useRef(tab);
  const motionDirection = useMemo(() => {
    const order: Tab[] = [
      "sources",
      "goals",
      "studio",
      "chat",
      "flashcards",
      "settings",
    ];
    const direction =
      order.indexOf(tab) < order.indexOf(motionTab.current) ? -1 : 1;
    return direction;
  }, [tab]);
  useLayoutEffect(() => {
    motionTab.current = tab;
  }, [tab]);
  const previousTab = useRef<Exclude<Tab, "settings">>("sources");
  const openSettings = () => {
    if (tab !== "settings") previousTab.current = tab;
    setTab("settings");
  };
  const leaveSettings = () => setTab(previousTab.current);
  useLayoutEffect(() => {
    // Reset the section before its reader/chat effects locate specific content.
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);
  const [sourceRequest, setSourceRequest] = useState<SourceRequest | null>(
    null,
  );
  const [vaultNoteRequest, setVaultNoteRequest] = useState<{
    vaultId: string;
    path: string;
    nonce: number;
  } | null>(null);
  const openVaultNote = (vaultId: string, path: string) => {
    void run("Opening note", async () => {
      const book = await api<Notebook>(`/vaults/${vaultId}/notebook`, "POST");
      await loadList();
      if (selected.current !== book.id) await choose(book.id);
      setVaultNoteRequest({ vaultId, path, nonce: Date.now() });
      setTab("sources");
    });
  };
  const openSource: OpenSource = (
    sourceId,
    quote,
    startSeconds,
    range,
    snapshot,
    snapshotMessageId,
  ) => {
    setSourceRequest(
      sourceId
        ? {
            sourceId,
            quote,
            startSeconds,
            range,
            snapshot,
            snapshotMessageId,
            nonce: Date.now(),
          }
        : null,
    );
    setTab("sources");
  };
  const [status, setStatus] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [activityRevision, setActivityRevision] = useState(0);
  const [openingNotebook, setOpeningNotebook] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [setupError, setSetupError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [notice, setNotice] = useState("");
  const selected = useRef<string | null>(null);
  const selectionRequest = useRef(0);
  const savedRevision = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const newTitleInput = useRef<HTMLInputElement>(null);
  const loadList = async (signal?: AbortSignal) => {
    const list = await api<Summary[]>("/notebooks", "GET", undefined, signal);
    if (!signal?.aborted) setNotebooks(list);
    return list;
  };
  const refresh = async (signal?: AbortSignal) => {
    if (selected.current) {
      const current = selected.current;
      const request = selectionRequest.current;
      const revision = savedRevision.current;
      const book = await api<Notebook>(
        "/notebooks/" + current,
        "GET",
        undefined,
        signal,
      );
      if (
        !signal?.aborted &&
        selected.current === current &&
        selectionRequest.current === request &&
        savedRevision.current === revision
      )
        setN(book);
    }
    if (!signal?.aborted) await loadList(signal);
  };
  const choose = async (id: string, fallbackId = n?.id || null) => {
    const request = ++selectionRequest.current;
    setOpeningNotebook(id);
    setSourceRequest(null);
    selected.current = id;
    try {
      localStorage.setItem("sennibook:last", id);
    } catch {}
    setError("");
    try {
      const book = await api<Notebook>("/notebooks/" + id);
      if (selectionRequest.current === request) setN(book);
    } catch (error) {
      if (selectionRequest.current === request) {
        selected.current = fallbackId;
        throw error;
      }
    } finally {
      if (selectionRequest.current === request) setOpeningNotebook(null);
    }
  };
  useEffect(() => {
    void (async () => {
      try {
        try {
          setOnboarding(await api<OnboardingStatus>("/onboarding"));
        } catch (e) {
          setSetupError((e as Error).message);
        }
        const [list, st] = await Promise.all([
          api("/workspaces/connect-existing", "POST").then(() => loadList()),
          api<Capabilities>("/status"),
        ]);
        setStatus(st);
        let last: string | null = null;
        try {
          last = localStorage.getItem("sennibook:last");
        } catch {}
        if (list.length)
          await choose(list.find((b) => b.id === last)?.id || list[0].id);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);
  useEffect(() => {
    if (createOpen) {
      dialog.current?.showModal();
      newTitleInput.current?.focus();
    } else dialog.current?.close();
  }, [createOpen]);
  const pendingSourceProcessing = !!n?.sources.some((source) =>
    ["recognizing", "transcribing"].includes(source.processing?.status || ""),
  );
  const pollInputs = useRef({ status, pendingSourceProcessing });
  useLayoutEffect(() => {
    pollInputs.current = { status, pendingSourceProcessing };
  }, [status, pendingSourceProcessing]);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const st = await api<Capabilities>("/status", "GET", undefined, signal);
        if (signal.aborted) return;
        const id = selected.current;
        const request = selectionRequest.current;
        const previous = pollInputs.current;
        const shouldRefresh =
          id &&
          (st.activeJobs[id] ||
            previous.status?.activeJobs[id] ||
            previous.pendingSourceProcessing);
        pollInputs.current = { ...previous, status: st };
        setStatus((current) =>
          JSON.stringify(current) === JSON.stringify(st) ? current : st,
        );
        if (shouldRefresh) {
          try {
            await refresh(signal);
          } catch (error) {
            if (
              !signal.aborted &&
              selected.current === id &&
              selectionRequest.current === request
            )
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not refresh notebook.",
              );
          }
        }
      } catch {
        // A missed background status check keeps the last known connection state.
      } finally {
        if (!signal.aborted) timer = setTimeout(() => void poll(), 2500);
      }
    };
    timer = setTimeout(() => void poll(), 2500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(label: string, work: () => Promise<void>) {
    const cancelling = label === "Cancelling";
    if (busyRef.current && !cancelling) return;
    if (!cancelling) {
      busyRef.current = true;
      setBusy(label);
    }
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!cancelling) {
        busyRef.current = false;
        setBusy("");
      }
      setActivityRevision((value) => value + 1);
    }
  }
  const change = async (url: string, method = "POST", body?: unknown) => {
    const book = await api<Notebook>(url, method, body);
    // A multi-file import can continue after the user switches notebooks.
    // Only the response's actual notebook may update the visible workspace.
    if (book.id && book.id === selected.current) {
      savedRevision.current++;
      setN(book);
    }
    try {
      await loadList();
    } catch {
      setError(
        "Your change was saved, but the notebook list could not refresh. Reload the app to update the list.",
      );
    }
  };
  const create = async (example = false) => {
    const book = await api<Notebook>("/notebooks", "POST", {
      title: example
        ? "The logic of coalitions"
        : newTitle.trim() || "Untitled notebook",
      example,
    });
    setCreateOpen(false);
    setNewTitle("");
    await openSavedNotebook(book);
  };
  const openSavedNotebook = async (book: Notebook) => {
    ++selectionRequest.current;
    selected.current = book.id;
    setOpeningNotebook(null);
    setSourceRequest(null);
    setN(book);
    setNotebooks((previous) => [
      {
        id: book.id,
        title: book.title,
        subject: book.settings.subject,
        sourceCount: book.sources.length,
        example: book.example,
      },
      ...previous.filter((item) => item.id !== book.id),
    ]);
    try {
      localStorage.setItem("sennibook:last", book.id);
    } catch {}
    setTab("sources");
    try {
      await loadList();
    } catch {
      setError(
        "Your notebook was saved and is open. The library list could not refresh; reload the app to update the list.",
      );
    }
  };
  const job = !!(n && status?.activeJobs[n.id]);
  const disabled = !!busy || job || !!openingNotebook;
  const saveSettings = async (settings: Settings) => {
    if (settings.assumedKnowledge.length > 5000)
      throw new Error(
        "The starting-knowledge brief can contain up to 5,000 characters. Shorten it before saving; your draft is still here.",
      );
    if (settings.harness.length > 12000)
      throw new Error(
        "The subject harness can contain up to 12,000 characters. Shorten it before saving; your draft is still here.",
      );
    if (n) await change(`/notebooks/${n.id}`, "PATCH", { settings });
  };
  if (!onboarding)
    return (
      <div className={window.sennibookDesktop ? "desktop-app" : ""}>
        <DesktopBar
          title="Getting started"
          onNew={() => {}}
          onSettings={() => {}}
        />
        <main id="main" className="ai-setup-page">
          <div className="ai-setup-sheet">
            <h1>Opening LMBook</h1>
            {setupError ? (
              <>
                <p role="alert" className="inline-error">
                  {setupError}
                </p>
                <InkButton
                  className="button"
                  onClick={() => {
                    setSetupError("");
                    void api<OnboardingStatus>("/onboarding")
                      .then(setOnboarding)
                      .catch((e) => setSetupError(e.message));
                  }}
                >
                  Try again
                </InkButton>
              </>
            ) : (
              <p role="status">Checking your setup…</p>
            )}
          </div>
        </main>
      </div>
    );
  if (onboarding.required)
    return (
      <div className={window.sennibookDesktop ? "desktop-app" : ""}>
        <DesktopBar
          title="Connect Codex"
          onNew={() => {}}
          onSettings={() => {}}
        />
        <FirstRunSetup
          initial={onboarding.connection}
          onComplete={() => setOnboarding({ ...onboarding, required: false })}
        />
      </div>
    );
  return (
    <div className={`app ${window.sennibookDesktop ? "desktop-app" : ""}`}>
      <DesktopBar
        title={n?.title || "Your learning library"}
        onNew={() => setCreateOpen(true)}
        onSettings={openSettings}
      />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("sources");
          }}
        >
          <span className="brand-mark">
            <BookOpen size={23} />
          </span>
          LMBook<span className="brand-dot">.</span>
        </a>
        <InkButton
          className="mobile-create icon-button light"
          aria-label="New notebook"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={20} />
        </InkButton>
        <div className="rail-label">
          <span>Your notebooks</span>
          <InkButton
            className="icon-button light"
            aria-label="Create notebook"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={18} />
          </InkButton>
        </div>
        <MotionNavigation
          activeKey={n?.id || ""}
          itemsKey={notebooks.map((book) => book.id).join(":")}
          selector=".notebook-item.selected"
          vertical
          className="notebook-list"
          aria-label="Notebooks"
        >
          {notebooks.map((book) => (
            <InkButton
              key={book.id}
              className={`notebook-item ${n?.id === book.id ? "selected" : ""}`}
              aria-current={n?.id === book.id ? "page" : undefined}
              onClick={() =>
                void (async () => {
                  await choose(book.id);
                })().catch((error: Error) => setError(error.message))
              }
            >
              <BookOpen size={17} />
              <span>
                <strong>{book.title}</strong>
                <small>
                  {book.subject} · {book.sourceCount}{" "}
                  {book.sourceCount === 1 ? "source" : "sources"}
                </small>
              </span>
            </InkButton>
          ))}
          {!notebooks.length && (
            <p className="rail-empty">Your courses will live here.</p>
          )}
        </MotionNavigation>
        <Button
          icon={Plus}
          variant="rail-new"
          onClick={() => setCreateOpen(true)}
        >
          New notebook
        </Button>
        <div className="sidebar-bottom">
          <InkButton
            className="rail-settings"
            title="Open an Obsidian folder as a notebook"
            disabled={!window.sennibookDesktop || !!busy}
            onClick={() =>
              void run("Opening folder", async () => {
                const vault = await window.sennibookDesktop?.chooseVault();
                if (!vault) return;
                const book = await api<Notebook>(
                  `/vaults/${vault.id}/notebook`,
                  "POST",
                );
                await loadList();
                await choose(book.id);
                setTab("sources");
              })
            }
          >
            <FolderOpen size={18} /> Open folder as notebook
          </InkButton>
          <div className="local-note">
            <span className="status-dot" /> Saved on this computer
          </div>
          <InkButton
            className={`rail-settings ${tab === "settings" ? "active" : ""}`}
            onClick={tab === "settings" ? leaveSettings : openSettings}
            title={tab === "settings" ? "Go back" : "Connections & settings"}
          >
            {tab === "settings" ? (
              <>
                <ArrowLeft size={18} /> Go back
              </>
            ) : (
              <>
                <Settings2 size={18} /> Connections & settings
              </>
            )}
          </InkButton>
          <div className="rail-foot">
            LMBook{" "}
            <span>
              {window.sennibookDesktop ? "Desktop" : "Web preview"} ·{" "}
              {appVersion}
            </span>
          </div>
        </div>
      </aside>
      <main id="main" className="main" tabIndex={-1}>
        <header className="topbar">
          <span>
            <Library size={15} /> Your learning library{" "}
            {n && (
              <>
                <ChevronRight size={14} />
                <strong>{n.settings.subject}</strong>
              </>
            )}
          </span>
          <span className="topbar-right">
            {busy || openingNotebook ? (
              <>
                <LoaderCircle className="spin" size={14} />
                {(n && status?.activeJobs[n.id]) || busy || "Opening notebook"}
              </>
            ) : job ? (
              <>
                <Radio size={14} /> {n && status?.activeJobs[n.id]}
              </>
            ) : null}
          </span>
        </header>
        {error && !createOpen && (
          <div className="alert error app-error" role="alert">
            <CircleAlert size={19} />
            <span>{error}</span>
            <InkButton
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={17} />
            </InkButton>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={17} />
            {notice}
          </div>
        )}
        {!loaded ? (
          <Empty icon={LoaderCircle} title="Opening your library…">
            Loading saved notebooks.
          </Empty>
        ) : tab === "settings" ? (
          <Connections
            refreshStatus={async () => {
              setStatus(await api<Capabilities>("/status"));
            }}
            restore={(file) =>
              run("Restoring notebook", async () => {
                if (file.size === 0)
                  throw new Error(
                    "This backup file is empty. Choose an LMBook ZIP backup.",
                  );
                if (file.size > 2 * 1024 * 1024 * 1024)
                  throw new Error("This backup exceeds the 2 GB upload limit.");
                const data = new FormData();
                data.append("file", file);
                const restored = await api<Notebook>(
                  "/notebooks/import",
                  "POST",
                  data,
                );
                await openSavedNotebook(restored);
                setNotice("Notebook restored as a new copy");
              })
            }
            key={n?.id || "settings"}
            n={n}
            status={status}
            disabled={disabled}
            trashRefreshKey={activityRevision}
            onNotebookRestored={async (id) => {
              await loadList();
              if (!selected.current) await choose(id);
              setNotice("Notebook restored to your library");
            }}
            save={(provider, model, onSaved) =>
              run("Saving settings", async () => {
                if (n)
                  await change(`/notebooks/${n.id}`, "PATCH", {
                    settings: { provider, model },
                  });
                onSaved();
                setNotice("Settings saved");
              })
            }
            rename={(title, description, onSaved) =>
              run("Saving notebook", async () => {
                if (n) {
                  await change(`/notebooks/${n.id}`, "PATCH", {
                    title,
                    description,
                  });
                  onSaved();
                  setNotice("Notebook updated");
                }
              })
            }
            remove={() =>
              run("Moving notebook to trash", async () => {
                if (!n) return;
                await api(`/notebooks/${n.id}`, "DELETE");
                setNotice("Notebook moved to Trash. Restore it in Settings.");
                setNotebooks((previous) =>
                  previous.filter((book) => book.id !== n.id),
                );
                // A completed removal must not move someone away from a
                // different notebook they selected while the request ran.
                const removedSelection = selected.current === n.id;
                if (removedSelection) {
                  ++selectionRequest.current;
                  selected.current = null;
                  setN(null);
                  try {
                    localStorage.removeItem("sennibook:last");
                  } catch {}
                  setTab("sources");
                }
                try {
                  const list = await loadList();
                  if (removedSelection && !selected.current && list.length)
                    await choose(list[0].id, null);
                } catch {
                  setError(
                    "The notebook moved to Trash, but the library could not refresh. Reload the app to update it.",
                  );
                }
              })
            }
          />
        ) : !n ? (
          <div className="welcome">
            <div className="welcome-heading">
              <h1>Your learning library.</h1>
              <p>
                Add your course material to ask questions, practise flashcards
                and create audio lessons.
              </p>
              <div className="actions">
                <Button
                  icon={Plus}
                  variant="primary"
                  onClick={() => setCreateOpen(true)}
                >
                  Create your first notebook
                </Button>
                <Button
                  icon={ArrowUpRight}
                  onClick={() =>
                    void run("Opening example", () => create(true))
                  }
                >
                  Explore an example
                </Button>
              </div>
            </div>
            <div className="welcome-book">
              <div className="book-spine" />
              <div className="book-cover">
                <BookOpen size={35} strokeWidth={1} />
              </div>
            </div>
            <div className="welcome-steps">
              <div>
                <FileText size={21} />
                <h3>Add sources</h3>
                <p>PDFs, notes and the sources you trust.</p>
              </div>
              <div>
                <Target size={21} />
                <h3>Set learning goals</h3>
                <p>Let your begrippen and leerdoelen guide the depth.</p>
              </div>
              <div>
                <Headphones size={21} />
                <h3>Generate audio</h3>
                <p>Create a two-person lesson from your sources.</p>
              </div>
            </div>
          </div>
        ) : (
          <WorkspaceBoundary name="The notebook workspace" active>
            <React.Suspense
              fallback={<p role="status">Opening notebook workspace…</p>}
            >
              <NotebookWorkspace
                key={n.id}
                notebookId={n.id}
                title={n.title}
                sourceFingerprint={JSON.stringify(
                  n.sources.map((source) => [
                    source.id,
                    source.processing?.status,
                    source.extractedSha256,
                    source.text.length,
                  ]),
                )}
                notebooks={notebooks}
                openRequest={vaultNoteRequest}
                onRefresh={refresh}
                onOpenNotebook={async (id, section = "sources") => {
                  await choose(id);
                  if (selected.current === id) setTab(section);
                }}
              >
                <div className="notebook-learning-heading">
                  <strong>Learn from this notebook</strong>
                  <DownloadLink
                    className="button small quiet"
                    href={`/api/notebooks/${n.id}/vault-export`}
                    filename={`${n.title}.zip`}
                  >
                    <Download size={15} />
                    Export vault
                  </DownloadLink>
                </div>
                <MotionNavigation
                  activeKey={`${n.id}:${tab}`}
                  selector="button.active"
                  className="tabs"
                  aria-label="Notebook sections"
                >
                  {(
                    [
                      {
                        id: "sources",
                        label: "Sources",
                        icon: FileText,
                        count: n.sources.length,
                      },
                      {
                        id: "goals",
                        label: "Learning goals",
                        icon: Target,
                        count: n.objectives.length,
                      },
                      {
                        id: "studio",
                        label: "Audio studio",
                        icon: Headphones,
                        count: n.episodes.length,
                      },
                      {
                        id: "chat",
                        label: "Ask your sources",
                        icon: MessageSquare,
                      },
                      {
                        id: "flashcards",
                        label: "Flashcards",
                        icon: BookOpen,
                        count: n.flashcards?.length || 0,
                      },
                    ] as const
                  ).map((t) => (
                    <InkButton
                      key={t.id}
                      className={tab === t.id ? "active" : ""}
                      aria-current={tab === t.id ? "page" : undefined}
                      onClick={() => setTab(t.id)}
                    >
                      <t.icon size={18} />
                      {t.label}
                      {"count" in t && (
                        <span className="tab-count">{t.count}</span>
                      )}
                    </InkButton>
                  ))}
                </MotionNavigation>
                <MotionSurface
                  motionKey={`${n.id}:${tab}`}
                  direction={motionDirection}
                  className="page-content"
                >
                  {job && (
                    <div className="job-banner" role="status">
                      <LoaderCircle className="spin" size={18} />
                      <span>
                        {n.episodes.find(
                          (e) => e.status === "script" || e.status === "audio",
                        )?.progress || status?.activeJobs[n.id]}
                        <small>
                          You can switch notebooks. Keep the local server
                          running.
                        </small>
                      </span>
                      <Button
                        icon={Square}
                        variant="quiet"
                        onClick={() =>
                          void run("Cancelling", async () => {
                            await api(`/notebooks/${n.id}/cancel`, "POST");
                            await refresh();
                          })
                        }
                      >
                        Stop
                      </Button>
                    </div>
                  )}
                  {tab === "sources" && (
                    <Sources
                      key={n.id}
                      n={n}
                      disabled={disabled}
                      run={run}
                      change={change}
                      next={() => setTab("goals")}
                      refresh={refresh}
                      settings={openSettings}
                      request={sourceRequest}
                      onCloseReader={() => setSourceRequest(null)}
                      onOpenVaultNote={openVaultNote}
                    />
                  )}
                  {tab === "goals" && (
                    <Goals
                      key={n.id}
                      n={n}
                      disabled={disabled}
                      run={run}
                      change={change}
                      next={() => setTab("studio")}
                      openSource={openSource}
                    />
                  )}
                  {tab === "studio" && (
                    <Studio
                      key={n.id}
                      n={n}
                      disabled={disabled}
                      status={status}
                      activityRevision={activityRevision}
                      run={run}
                      change={change}
                      refresh={refresh}
                      saveSettings={saveSettings}
                      settings={openSettings}
                    />
                  )}
                  {tab === "chat" && (
                    <Chat
                      key={n.id}
                      n={n}
                      disabled={disabled}
                      run={run}
                      change={change}
                      openSource={openSource}
                    />
                  )}
                  {tab === "flashcards" && (
                    <Flashcards
                      key={n.id}
                      n={n}
                      disabled={disabled}
                      run={run}
                      change={change}
                    />
                  )}
                </MotionSurface>
              </NotebookWorkspace>
            </React.Suspense>
          </WorkspaceBoundary>
        )}
      </main>
      <dialog
        ref={dialog}
        aria-labelledby="create-notebook-heading"
        onCancel={() => setCreateOpen(false)}
        className="create-dialog"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("Creating notebook", () => create());
          }}
        >
          <div className="section-heading">
            <InkHeading id="create-notebook-heading" arrivalKey={createOpen}>
              Create a notebook
            </InkHeading>
            <InkButton
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={() => setCreateOpen(false)}
            >
              <X size={20} />
            </InkButton>
          </div>
          <p>One notebook for a course, topic or question.</p>
          {error && (
            <div className="alert error" role="alert">
              <CircleAlert size={19} />
              <span>{error}</span>
            </div>
          )}
          <Field label="Notebook name">
            <InkInput
              ref={newTitleInput}
              required
              maxLength={150}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Biology — cell communication"
            />
          </Field>
          <div className="actions end">
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              icon={ArrowRight}
              disabled={!!busy}
            >
              Create notebook
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
type WorkProps = {
  n: Notebook;
  disabled: boolean;
  run: (label: string, work: () => Promise<void>) => Promise<void>;
  change: (url: string, method?: string, body?: unknown) => Promise<void>;
};
function Sources({
  n,
  disabled,
  run,
  change,
  next,
  refresh,
  settings,
  request,
  onCloseReader,
  onOpenVaultNote,
}: WorkProps & {
  next: () => void;
  refresh: () => Promise<void>;
  settings: () => void;
  request: SourceRequest | null;
  onCloseReader: () => void;
  onOpenVaultNote: (vaultId: string, path: string) => void;
}) {
  const sourceTitleDraft = useDraftText(`${n.id}:source-title`, "", 200);
  const workspaceVaultId = useContext(WorkspaceVaultContext);
  const externalVaultSources = n.sources.filter(
    (source) => source.vault && source.vault.vaultId !== workspaceVaultId,
  );
  const sourceTextDraft = useDraftText(`${n.id}:source-text`, "", 1_000_000);
  const { text: title, setText: setTitle } = sourceTitleDraft;
  const { text, setText } = sourceTextDraft;
  const [adding, setAdding] = useState(Boolean(title || text));
  const sourceKindDraft = useDraftText(`${n.id}:source-kind`, "course", 20);
  const kind = sourceKindDraft.text === "supplement" ? "supplement" : "course";
  const setKind = sourceKindDraft.setText;
  const [reading, setReading] = useState<SourceRequest | null>(request);
  const selected =
    reading?.snapshot ||
    n.sources.find((source) => source.id === reading?.sourceId) ||
    null;
  const reader = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLElement>(null);
  useCitationMotion(highlight, `${reading?.sourceId}:${reading?.nonce}`);
  const location = useMemo(
    () =>
      selected && reading?.range
        ? locateSourceRange(
            selected,
            reading.range.startOffset,
            reading.range.endOffset,
          )
        : selected && reading?.quote
          ? locateEvidence(selected, reading.quote)
          : undefined,
    [selected, reading],
  );
  useEffect(() => {
    if (request) setReading(request);
  }, [request]);
  useEffect(() => {
    if (!reading) return;
    if (
      selected?.attachment?.mediaType.startsWith("audio/") &&
      reading.startSeconds !== undefined &&
      selected.transcript?.segments.some(
        (segment, index, segments) =>
          reading.startSeconds! >= segment.start &&
          (reading.startSeconds! < segment.end ||
            (index === segments.length - 1 &&
              reading.startSeconds === segment.end)),
      )
    )
      return;
    const target = highlight.current || reader.current;
    target?.scrollIntoView({
      block: "center",
      behavior: canAnimate() ? "smooth" : "instant",
    });
    target?.focus({ preventScroll: true });
  }, [reading]);
  const [query, setQuery] = useState("");
  const sourceWordCounts = useMemo(
    () => new Map(n.sources.map((source) => [source.id, words(source.text)])),
    [n.sources],
  );
  const totalSourceWords = useMemo(
    () =>
      Array.from(sourceWordCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      ),
    [sourceWordCounts],
  );
  const visibleSources = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? n.sources.filter(
          (source) =>
            source.title.toLowerCase().includes(search) ||
            source.text.toLowerCase().includes(search),
        )
      : n.sources;
  }, [n.sources, query]);
  const file = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    await run("Importing sources", async () => {
      let imported = 0;
      for (const f of Array.from(files)) {
        const data = new FormData();
        data.append("file", f);
        data.append("kind", kind);
        const audio = /\.(mp3|wav|m4a|mp4|flac|ogg|opus|aac|webm)$/i.test(
          f.name,
        );
        try {
          if (f.size === 0)
            throw new Error(
              "This file is empty. Choose a file containing source material.",
            );
          if (f.size > (audio ? 500 : 20) * 1024 * 1024)
            throw new Error(
              `This file exceeds the ${audio ? "500 MB recording" : "20 MB document"} upload limit.`,
            );
          await change(
            `/notebooks/${n.id}/${audio ? "audio-source" : "upload"}`,
            "POST",
            data,
          );
          imported++;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "This file could not be imported.";
          throw new Error(
            `${f.name}: ${message} ${imported ? `${imported} ${imported === 1 ? "file was" : "files were"} imported before this error. Retry only the remaining files.` : "No files in this batch were imported."}`,
          );
        }
      }
    });
    if (file.current) file.current.value = "";
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <InkHeading>Sources</InkHeading>
          <p>Original sources stay separate from added context.</p>
        </div>
        <Button
          icon={Plus}
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
          disabled={disabled}
        >
          {adding ? "Close editor" : "Paste a source"}
        </Button>
      </div>
      {externalVaultSources.length > 0 && (
        <WorkspaceBoundary name="Vault source review">
          <React.Suspense
            fallback={<p role="status">Opening vault source review…</p>}
          >
            <VaultSourceReview
              notebook={{ ...n, sources: externalVaultSources }}
              onUpdated={refresh}
              onOpenVaultNote={onOpenVaultNote}
            />
          </React.Suspense>
        </WorkspaceBoundary>
      )}
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) void upload(e.dataTransfer.files);
        }}
      >
        <div className="upload-symbol">
          <Upload size={23} />
        </div>
        <div>
          <strong>Add a source</strong>
          <p>
            Documents, Markdown and page images · up to 20 MB. Audio recordings
            · up to 500 MB.
          </p>
        </div>
        <Button
          icon={Upload}
          onClick={() => file.current?.click()}
          disabled={disabled}
        >
          Choose files
        </Button>
        <InkInput
          ref={file}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.html,.htm,.txt,.md,.markdown,.csv,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.mp4,.flac,.ogg,.opus,.aac,.webm"
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {adding && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run("Adding source", async () => {
              if (text.trim().length > 1_000_000)
                throw new Error(
                  "A pasted source can contain up to 1,000,000 characters. Split it into sections; your draft is still here.",
                );
              await change(`/notebooks/${n.id}/sources`, "POST", {
                title,
                text,
                kind,
              });
              const clearedTitle = sourceTitleDraft.accept(title);
              const clearedText = sourceTextDraft.accept(text);
              if (clearedTitle && clearedText) setAdding(false);
            });
          }}
        >
          <DraftNotice
            error={
              sourceTextDraft.storageError || sourceTitleDraft.storageError
            }
            restored={sourceTextDraft.restored || sourceTitleDraft.restored}
          />
          <div className="form-row">
            <Field label="Source title">
              <InkInput
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Article, chapter or lecture title"
                maxLength={200}
              />
            </Field>
            <Field label="Source type">
              <InkSelect
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="course">Course material</option>
                <option value="supplement">Supplementary source</option>
              </InkSelect>
            </Field>
          </div>
          <Field label="Source text">
            <InkTextarea
              required
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the original text here. Include author, URL and date where available."
            />
          </Field>
          <div className="actions end">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={disabled}>
              Add source
            </Button>
          </div>
        </form>
      )}
      <div className="source-toolbar">
        <span>
          {n.sources.length} source{n.sources.length !== 1 ? "s" : ""} ·{" "}
          {totalSourceWords.toLocaleString()} words
        </span>
        <label className="search">
          <Search size={16} />
          <InkInput
            aria-label="Search sources"
            placeholder="Find a source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {!n.sources.length ? (
        <Empty icon={FileText} title="Start with your course material">
          Add a chapter, a lecture or your own notes. You can add learning
          objectives next.
        </Empty>
      ) : !visibleSources.length ? (
        <Empty
          icon={Search}
          title="No sources match your search"
          action={
            <Button variant="quiet" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        >
          Try a different term or clear the search to see all your sources.
        </Empty>
      ) : (
        <MotionList
          itemsKey={visibleSources.map((source) => source.id).join(":")}
          className="source-list"
        >
          {visibleSources.map((s, i) => (
            <div
              className="source-row"
              key={s.id}
              data-source-open={selected?.id === s.id}
            >
              <div className="file-symbol">
                {s.attachment?.mediaType.startsWith("audio/") ? (
                  <Headphones size={20} />
                ) : (
                  <FileText size={20} />
                )}
              </div>
              <InkButton
                className="source-open"
                onClick={() =>
                  setReading({ sourceId: s.id, nonce: Date.now() })
                }
              >
                <strong>{s.title}</strong>
                <span>
                  {s.kind === "course" ? "Course material" : "Supplementary"}{" "}
                  <b>·</b>{" "}
                  {s.processing?.status === "transcribing"
                    ? "Transcribing…"
                    : s.processing?.status === "recognizing"
                      ? "Reading scanned text…"
                      : s.processing?.status === "pending"
                        ? s.processing.task === "ocr"
                          ? "Ready to read scanned text"
                          : "Ready to transcribe"
                        : s.processing?.status === "failed"
                          ? s.processing.task === "ocr"
                            ? "Scanned text needs attention"
                            : "Transcription needs attention"
                          : `${sourceWordCounts.get(s.id)?.toLocaleString()} words`}
                </span>
              </InkButton>
              <span className="source-index">
                {String(i + 1).padStart(2, "0")}
              </span>
              <InkButton
                className="icon-button"
                title="Read source"
                aria-label={`Read ${s.title}`}
                onClick={() =>
                  setReading({ sourceId: s.id, nonce: Date.now() })
                }
              >
                <ArrowUpRight size={18} />
              </InkButton>
              <InkButton
                disabled={disabled}
                className="icon-button delete"
                aria-label={`Remove ${s.title}`}
                onClick={async () => {
                  if (
                    await confirmInk(
                      `Remove “${s.title}” from this notebook? Existing episodes retain their saved source snapshots. The current coverage map will be cleared.`,
                      "Remove source?",
                      "Remove source",
                    )
                  )
                    void run("Removing source", () =>
                      change(`/notebooks/${n.id}/sources/${s.id}`, "DELETE"),
                    );
                }}
              >
                <Trash2 size={16} />
              </InkButton>
            </div>
          ))}
        </MotionList>
      )}
      {n.sources.length > 0 && (
        <div className="next-step">
          <div>
            <Target size={23} />
            <span>
              <strong>Next: add learning goals</strong>
              <small>
                Add the concepts and learning goals you want this notebook to
                cover.
              </small>
            </span>
          </div>
          <Button icon={ArrowRight} variant="primary" onClick={next}>
            Learning goals
          </Button>
        </div>
      )}
      {selected && (
        <MotionSurface
          kind="reader"
          motionKey={`${selected.id}:${reading?.nonce}`}
          className="reader"
          elementRef={reader}
          tabIndex={-1}
          aria-label="Source reader"
        >
          <div className="section-heading">
            <div>
              <span className="kicker">
                {reading?.snapshot
                  ? "Source text saved with this answer"
                  : "Source text"}
              </span>
              <InkHeading>{selected.title}</InkHeading>
            </div>
            <Button
              icon={X}
              onClick={() => {
                setReading(null);
                onCloseReader();
              }}
            >
              Close reader
            </Button>
          </div>
          {selected.attachment && (
            <DownloadLink
              className="button quiet"
              href={`/api/notebooks/${n.id}/sources/${selected.id}/original${reading?.snapshotMessageId ? `?message=${encodeURIComponent(reading.snapshotMessageId)}` : ""}`}
              filename={selected.attachment.filename}
              download
            >
              <Download size={16} /> Download original
            </DownloadLink>
          )}
          {!reading?.snapshot &&
            selected.attachment &&
            ["application/pdf", "image/png", "image/jpeg"].includes(
              selected.attachment.mediaType,
            ) && (
              <SourceOcr
                key={selected.id}
                source={selected}
                notebookId={n.id}
                language={n.settings.language}
                disabled={disabled}
                onChanged={refresh}
              />
            )}
          <SourceImage
            key={`${selected.id}:${reading?.snapshotMessageId || "current"}`}
            source={selected}
            notebookId={n.id}
            messageId={reading?.snapshotMessageId}
          />
          {!!selected.extractionWarnings?.length &&
            !(selected.processing?.task === "ocr" && !selected.text.trim()) &&
            !selected.attachment?.mediaType.startsWith("audio/") && (
              <div className="alert" role="note">
                <CircleAlert size={18} />
                <span>{selected.extractionWarnings.join(" ")}</span>
              </div>
            )}
          {selected.attachment?.mediaType.startsWith("audio/") ? (
            <SourceAudio
              key={selected.id}
              source={selected}
              notebookId={n.id}
              disabled={disabled}
              messageId={reading?.snapshotMessageId}
              readOnly={!!reading?.snapshot}
              onChanged={refresh}
              onSetup={settings}
              initialTime={reading?.startSeconds}
            />
          ) : (
            <div className="source-text">
              {location?.startOffset !== undefined &&
              location.endOffset !== undefined ? (
                <>
                  {selected.text.slice(0, location.startOffset)}
                  <mark
                    className="source-highlight"
                    tabIndex={-1}
                    ref={highlight}
                  >
                    {selected.text.slice(
                      location.startOffset,
                      location.endOffset,
                    )}
                  </mark>
                  {selected.text.slice(location.endOffset)}
                </>
              ) : (
                selected.text
              )}
            </div>
          )}
        </MotionSurface>
      )}
    </>
  );
}
function EvidenceList({
  evidence,
  n,
  onOpenSource,
  snapshots,
}: {
  evidence: Evidence[];
  n: Notebook;
  onOpenSource?: OpenSource;
  snapshots?: Source[];
}) {
  const passages = useMemo(
    () =>
      evidence.map((item) => {
        const source =
          snapshots?.find((source) => source.id === item.sourceId) ||
          n.sources.find((source) => source.id === item.sourceId);
        return {
          evidence: item,
          source,
          location: source ? locateEvidence(source, item.quote) : undefined,
        };
      }),
    [evidence, n.sources, snapshots],
  );
  return (
    <div className="evidence-list">
      {passages.map(({ evidence: e, source, location }, i) => {
        return (
          <blockquote key={i}>
            <p>“{e.quote}”</p>
            <cite>
              {source && onOpenSource ? (
                <InkButton
                  className="evidence-link"
                  onClick={() =>
                    onOpenSource(
                      source.id,
                      e.quote,
                      location?.startSeconds,
                      undefined,
                      snapshots?.find((item) => item.id === source.id),
                    )
                  }
                >
                  <FileText size={13} /> {source.title}
                  {location ? ` · ${location.label}` : " · passage has changed"}
                </InkButton>
              ) : (
                <>
                  <FileText size={13} />
                  {source?.title || "Source no longer available"}
                </>
              )}
            </cite>
          </blockquote>
        );
      })}
    </div>
  );
}
function Goals({
  n,
  disabled,
  run,
  change,
  next,
  openSource,
}: WorkProps & { next: () => void; openSource: OpenSource }) {
  const goalsDraft = useDraftText(`${n.id}:goals`, "", 320_000);
  const { text, setText } = goalsDraft;
  const goalKindDraft = useDraftText(`${n.id}:goal-kind`, "goal", 20);
  const kind: "goal" | "concept" =
    goalKindDraft.text === "concept" ? "concept" : "goal";
  const setKind = goalKindDraft.setText;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [fromSource, setFromSource] = useState("");
  const covered = n.coverage.filter((c) => c.status === "covered").length;
  const partial = n.coverage.filter((c) => c.status === "partial").length;
  const visibleGoals = n.objectives.filter(
    (objective) =>
      filter === "all" ||
      n.coverage.find((coverage) => coverage.objectiveId === objective.id)
        ?.status === filter,
  );
  const save = (objectives: Notebook["objectives"]) =>
    change(`/notebooks/${n.id}/objectives`, "PUT", objectives);
  return (
    <>
      <div className="section-heading">
        <div>
          <InkHeading>What do you want to understand?</InkHeading>
        </div>
        <Button
          variant="primary"
          icon={Target}
          disabled={disabled || !n.sources.length || !n.objectives.length}
          onClick={() =>
            void run("Mapping source coverage", () =>
              change(`/notebooks/${n.id}/coverage`),
            )
          }
        >
          Map source coverage
        </Button>
      </div>
      <div className="goals-entry">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const lines = text
              .split("\n")
              .map((s) => s.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, "").trim())
              .filter(Boolean);
            void run("Adding learning goals", async () => {
              const seen = new Set(
                n.objectives.map((o) => o.text.toLowerCase()),
              );
              const add = lines
                .filter((s) => {
                  if (seen.has(s.toLowerCase())) return false;
                  seen.add(s.toLowerCase());
                  return true;
                })
                .map((s) => ({ id: uid(), text: s, kind, important: true }));
              if (add.some((item) => item.text.length > 2000))
                throw new Error(
                  "Each learning goal can contain up to 2,000 characters. Shorten or split the long item; your list is still here.",
                );
              if (n.objectives.length + add.length > 150)
                throw new Error(
                  "A notebook can contain up to 150 learning goals and concepts. Split the list into course sections; your draft is still here.",
                );
              await save([...n.objectives, ...add]);
              goalsDraft.accept(text);
            });
          }}
        >
          <Field label="Paste your list — one item per line">
            <InkTextarea
              rows={3}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Explain how…&#10;Compare the effects of…&#10;Evaluate the evidence for…"
            />
          </Field>
          <DraftNotice
            error={goalsDraft.storageError}
            restored={goalsDraft.restored}
          />
          <div className="form-row entry-actions">
            <InkSelect
              aria-label="Item type"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="goal">Learning objectives / leerdoelen</option>
              <option value="concept">Concepts / begrippen</option>
            </InkSelect>
            <Button
              type="submit"
              icon={Plus}
              disabled={disabled || !text.trim()}
            >
              Add to notebook
            </Button>
          </div>
        </form>
        <div className="extract-goals">
          <p>
            Upload your objectives as a source, then let the model extract the
            list.
          </p>
          <InkSelect
            aria-label="Source to extract goals from"
            value={fromSource}
            onChange={(e) => setFromSource(e.target.value)}
          >
            <option value="">Choose an uploaded source</option>
            {n.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </InkSelect>
          <Button
            icon={Sparkles}
            disabled={disabled || !fromSource}
            onClick={() =>
              void run("Extracting objectives", () =>
                change(`/notebooks/${n.id}/extract-objectives`, "POST", {
                  text: n.sources.find((s) => s.id === fromSource)?.text,
                }),
              )
            }
          >
            Extract goals & concepts
          </Button>
        </div>
      </div>
      <div className="coverage-toolbar">
        <div className="filter-group">
          {[
            ["all", "All goals"],
            ["covered", "Covered"],
            ["partial", "Partial"],
            ["missing", "Gaps"],
          ].map(([value, label]) => (
            <InkButton
              key={value}
              className={filter === value ? "selected" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </InkButton>
          ))}
        </div>
        {n.coverage.length > 0 ? (
          <span>
            {covered} covered · {partial} partial ·{" "}
            {n.objectives.length - covered - partial} gaps
          </span>
        ) : (
          <span>Coverage has not been assessed</span>
        )}
      </div>
      {!n.objectives.length ? (
        <Empty icon={Target} title="Give your episode a purpose">
          Paste your learning objectives or concepts above. These become the
          backbone of the conversation.
        </Empty>
      ) : !visibleGoals.length ? (
        <Empty
          icon={Target}
          title="No goals match this filter"
          action={
            <Button variant="quiet" onClick={() => setFilter("all")}>
              Show all goals
            </Button>
          }
        >
          {n.coverage.length
            ? "Choose another coverage filter to see your goals."
            : "Coverage has not been assessed yet. Your goals are still in the notebook."}
        </Empty>
      ) : (
        <MotionList
          itemsKey={`${visibleGoals.map((goal) => goal.id).join(":")}:${expanded}`}
          className="objective-list"
        >
          {visibleGoals.map((o) => {
            const i = n.objectives.findIndex(
              (objective) => objective.id === o.id,
            );
            const c = n.coverage.find((c) => c.objectiveId === o.id);
            return (
              <div key={o.id} className="objective">
                <div className="objective-row">
                  <span className="objective-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <InkButton
                    className={`bookmark ${o.important ? "marked" : ""}`}
                    aria-pressed={o.important}
                    aria-label={`${o.important ? "Unmark" : "Mark"} ${o.text} as important`}
                    disabled={disabled}
                    onClick={() =>
                      void run("Updating goal", () =>
                        save(
                          n.objectives.map((item) =>
                            item.id === o.id
                              ? { ...item, important: !item.important }
                              : item,
                          ),
                        ),
                      )
                    }
                  >
                    <Bookmark
                      size={18}
                      fill={o.important ? "currentColor" : "none"}
                    />
                  </InkButton>
                  <InkButton
                    className="objective-main"
                    aria-expanded={expanded === o.id}
                    aria-controls={
                      expanded === o.id ? `goal-evidence-${o.id}` : undefined
                    }
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  >
                    <span className="item-kind">
                      {o.kind === "goal" ? "Learning objective" : "Concept"}
                    </span>
                    <strong>{o.text}</strong>
                  </InkButton>
                  <span className={`badge ${c?.status || "unmapped"}`}>
                    {c?.status === "covered" ? <Check size={13} /> : null}
                    {c?.status === "missing"
                      ? "Not established"
                      : c?.status || "Not mapped"}
                  </span>
                  <InkButton
                    className="icon-button"
                    aria-label={
                      expanded === o.id
                        ? "Collapse evidence"
                        : "Expand evidence"
                    }
                    aria-expanded={expanded === o.id}
                    aria-controls={
                      expanded === o.id ? `goal-evidence-${o.id}` : undefined
                    }
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  >
                    <ChevronRight size={18} />
                  </InkButton>
                  <InkButton
                    className="icon-button delete"
                    aria-label={`Remove goal ${i + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      void run("Removing goal", () =>
                        save(n.objectives.filter((item) => item.id !== o.id)),
                      )
                    }
                  >
                    <X size={15} />
                  </InkButton>
                </div>
                {expanded === o.id && (
                  <div
                    className="objective-detail"
                    id={`goal-evidence-${o.id}`}
                  >
                    {c ? (
                      <>
                        <p>{c.explanation}</p>
                        <EvidenceList
                          evidence={c.evidence}
                          n={n}
                          onOpenSource={openSource}
                        />
                        {c.context && (
                          <ContextSummary
                            summary={c.context}
                            sources={n.sources}
                            onOpenSource={openSource}
                          />
                        )}
                        {c.status !== "covered" && (
                          <div className="gap-action">
                            <span>
                              Suggested research: {c.searchQuery || o.text}
                            </span>
                            <a
                              className="button"
                              href={`https://www.google.com/search?q=${encodeURIComponent(c.searchQuery || o.text)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Search size={15} /> Search the gap
                            </a>
                            <Button icon={Plus} onClick={() => openSource()}>
                              Add a source
                            </Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p>
                        Run “Map source coverage” to find supporting passages
                        and gaps. The model proposes coverage; exact quotes are
                        checked against your sources.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </MotionList>
      )}
      <p className="fine-print">
        <Bookmark size={13} /> Marked items get extra emphasis. All objectives
        remain part of the episode. Gap research opens in your browser; new
        sources are added by you.
      </p>
      {n.objectives.length > 0 && (
        <div className="next-step">
          <div>
            <Headphones size={24} />
            <span>
              <strong>Next: create an episode</strong>
              <small>
                Choose the depth, language and length in the audio studio.
              </small>
            </span>
          </div>
          <Button variant="primary" icon={ArrowRight} onClick={next}>
            Open audio studio
          </Button>
        </div>
      )}
    </>
  );
}
function Studio({
  n,
  disabled,
  status,
  activityRevision,
  run,
  change,
  refresh,
  saveSettings,
  settings,
}: WorkProps & {
  status: Capabilities | null;
  activityRevision: number;
  refresh: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  settings: () => void;
}) {
  const configurationDraft = useObjectDraft(
    `${n.id}:episode-configuration`,
    n.settings,
    (Object.keys(n.settings) as (keyof Settings)[]).filter(
      (key) => key !== "provider" && key !== "model",
    ),
  );
  const { value: draft, setValue: setDraft } = configurationDraft;
  const savedSelection = useMemo(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(`sennibook:studio:${n.id}`) || "null",
      );
      return {
        episodeId: typeof value?.episodeId === "string" ? value.episodeId : "",
        chapterId: typeof value?.chapterId === "string" ? value.chapterId : "",
      };
    } catch {
      return { episodeId: "", chapterId: "" };
    }
  }, [n.id]);
  const [eid, setEid] = useState(
    savedSelection.episodeId || n.episodes[0]?.id || "",
  );
  const [cid, setCid] = useState(savedSelection.chapterId);
  const [editing, setEditing] = useState(false);
  const [sourceReader, setSourceReader] = useState<{
    episodeId: string;
    trigger: HTMLElement | null;
    source: Source;
    range?: { startOffset: number; endOffset: number };
    startSeconds?: number;
  } | null>(null);
  const [showHarness, setShowHarness] = useState(false);
  const e = n.episodes.find((ep) => ep.id === eid) || n.episodes[0];
  const episodeVoiceDraft = useObjectDraft(
    `${n.id}:${e?.id || "none"}:episode-voices`,
    e?.settings || n.settings,
    Object.keys(speechSettingsSchema.shape) as (keyof Settings)[],
  );
  const { value: episodeVoices, setValue: setEpisodeVoices } =
    episodeVoiceDraft;
  const c = e?.chapters.find((ch) => ch.id === cid) || e?.chapters[0];
  useEffect(() => {
    if (!e) return;
    try {
      localStorage.setItem(
        `sennibook:studio:${n.id}`,
        JSON.stringify({ episodeId: e.id, chapterId: c?.id || "" }),
      );
    } catch {}
  }, [n.id, e?.id, c?.id]);
  const savedScript = useMemo(
    () => c?.turns.map((t) => `${t.speaker}: ${t.text}`).join("\n\n") || "",
    [c?.turns],
  );
  const scriptKey = `${n.id}:${e?.id || "none"}:${c?.id || "none"}:script`;
  const currentScriptKey = useRef(scriptKey);
  currentScriptKey.current = scriptKey;
  const scriptDraft = useDraftText(scriptKey, savedScript, 1_201_000);
  const { text: script, setText: setScript } = scriptDraft;
  const episodeSources = e?.sources || n.sources;
  const episodeObjectives = e?.objectives || n.objectives;
  const chapterWords = useMemo(
    () =>
      new Map(
        e?.chapters.map((chapter) => [
          chapter.id,
          words(chapter.turns.map((turn) => turn.text).join(" ")),
        ]),
      ),
    [e?.chapters],
  );
  const totalWords = [...chapterWords.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const hasScript = !!e?.chapters.every((ch) => ch.turns.length);
  const fullAudio = !!e?.chapters.every((ch) => ch.audioFile);
  const qualityWarnings = useMemo(
    () => (e ? evaluateEpisodeQuality(e) : []),
    [e],
  );
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft({ ...draft, [key]: value });
  const ttsCost = estimateSpeech(
    totalWords ? totalWords / 145 : draft.minutes,
    e?.settings.ttsModel || draft.ttsModel,
  );
  const episodeCartesia = e?.settings.ttsProvider === "cartesia";
  const speechConnected =
    (e?.settings || draft).ttsProvider === "cartesia"
      ? !!status?.cartesia
      : !!status?.googleProject;
  const episodeCredits = useMemo(
    () =>
      cartesiaCredits(
        e?.chapters
          .flatMap((ch) => ch.turns.map((turn) => turn.text))
          .join("") || "",
      ),
    [e?.chapters],
  );
  const speechEstimate = episodeCartesia
    ? `~${episodeCredits.toLocaleString()} credits`
    : priceLabel(ttsCost);
  const draftVoiceError = voiceSelectionError(draft);
  const episodeVoiceError = voiceSelectionError(episodeVoices);
  const episodeVoicesChanged =
    !!e &&
    JSON.stringify(speechSettingsSchema.parse(episodeVoices)) !==
      JSON.stringify(speechSettingsSchema.parse(e.settings));
  useEffect(() => {
    setEditing(false);
    setSourceReader(null);
  }, [e?.id, c?.id]);
  const audioAction = (isPreview: boolean) =>
    void run(
      isPreview ? "Starting voice preview" : "Starting audio generation",
      async () => {
        if (!e) return;
        await api(`/notebooks/${n.id}/episodes/${e.id}/audio`, "POST", {
          preview: isPreview,
        });
        await refresh();
      },
    );
  const startScript = () =>
    void run("Starting script generation", async () => {
      if (!e) return;
      await api(`/notebooks/${n.id}/episodes/${e.id}/script`, "POST");
      await refresh();
    });
  return (
    <div className={`studio-layout ${e ? "has-episode" : ""}`}>
      <aside className="episode-config">
        <div className="config-heading">
          <Radio size={21} />
          <h2>Episode settings</h2>
        </div>
        <p className="muted">These settings apply to your next episode.</p>
        <DraftNotice
          error={configurationDraft.error}
          restored={configurationDraft.restored}
        />
        {(configurationDraft.changed || configurationDraft.error) && (
          <Button
            variant="quiet"
            disabled={disabled}
            onClick={configurationDraft.discard}
          >
            Discard setup draft
          </Button>
        )}
        <Field label="Subject profile">
          <InkSelect
            value={draft.subject}
            disabled={disabled}
            onChange={(ev) => {
              const subject = ev.target.value as Settings["subject"];
              setDraft({ ...draft, subject, harness: profiles[subject] });
            }}
          >
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </InkSelect>
        </Field>
        <div className="form-row">
          <Field label="Language">
            <InkSelect
              value={draft.language}
              disabled={disabled}
              onChange={(ev) =>
                update("language", ev.target.value as Settings["language"])
              }
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
            </InkSelect>
          </Field>
          <Field label="Depth">
            <InkSelect
              value={draft.depth}
              disabled={disabled}
              onChange={(ev) =>
                update("depth", ev.target.value as Settings["depth"])
              }
            >
              <option>Foundations</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </InkSelect>
          </Field>
        </div>
        <Field label="Listening purpose">
          <InkSelect
            value={draft.purpose}
            disabled={disabled}
            onChange={(ev) =>
              update("purpose", ev.target.value as Settings["purpose"])
            }
          >
            <option>Introduction</option>
            <option>Deep exploration</option>
            <option>Exam refresher</option>
          </InkSelect>
        </Field>
        <Field
          label={`Target length · ${draft.minutes} minutes`}
          hint="Actual length depends on the script and delivery."
        >
          <InkInput
            type="range"
            min={5}
            max={120}
            step={5}
            value={draft.minutes}
            disabled={disabled}
            onChange={(ev) => update("minutes", Number(ev.target.value))}
          />
          <div className="range-labels">
            <span>5 min</span>
            <span>2 hours</span>
          </div>
        </Field>
        <Field label="What can the hosts assume you know?">
          <InkTextarea
            rows={3}
            value={draft.assumedKnowledge}
            disabled={disabled}
            onChange={(ev) => update("assumedKnowledge", ev.target.value)}
            placeholder="e.g. I understand parliamentary systems. Skip introductory definitions."
          />
        </Field>
        <InkButton
          className="disclosure"
          aria-expanded={showHarness}
          onClick={() => setShowHarness(!showHarness)}
        >
          <Settings2 size={15} /> Edit teaching instructions{" "}
          <ChevronRight size={15} />
        </InkButton>
        {showHarness && (
          <Field
            label="Subject harness"
            hint="Saved with each episode so you can compare approaches."
          >
            <InkTextarea
              rows={7}
              value={draft.harness}
              disabled={disabled}
              onChange={(ev) => update("harness", ev.target.value)}
            />
          </Field>
        )}
        <div className="config-divider" />
        <details className="voice-settings">
          <summary>
            Voice settings{" "}
            <span>
              {draft.ttsProvider === "cartesia"
                ? "Cartesia · Sonic 3.6"
                : `${draft.voiceA} & ${draft.voiceB}`}
            </span>
          </summary>
          <SpeechSettings
            value={draft}
            onChange={setDraft}
            disabled={disabled}
            connected={!!status?.cartesia}
          />
        </details>
        <div className="cost-note">
          <span>Next episode · target estimate</span>
          <strong>
            {draft.ttsProvider === "cartesia" ? (
              `~${Math.round(draft.minutes * 870).toLocaleString()} credits`
            ) : (
              <>
                {priceLabel(estimateSpeech(draft.minutes, draft.ttsModel))}{" "}
                <small>USD</small>
              </>
            )}
          </strong>
          <p>
            {draft.ttsProvider === "cartesia"
              ? "Assumes 145 words per minute and 6 characters per word. Actual usage follows the script; retries use extra credits. Balance is not checked."
              : "Before input, retries and taxes. Cloud credits are not checked by this app."}
          </p>
        </div>
        <Button
          variant="primary wide"
          icon={Sparkles}
          disabled={disabled || !n.sources.length || !n.objectives.length}
          onClick={() =>
            void run("Planning your episode", async () => {
              await saveSettings(draft);
              configurationDraft.accept();
              await change(`/notebooks/${n.id}/episodes`);
              setEid("");
              setCid("");
            })
          }
        >
          Plan an episode
        </Button>
        {draftVoiceError && (
          <p className="fine-print">
            Before generating audio: {draftVoiceError}
          </p>
        )}
        <p className="fine-print">
          Uses{" "}
          {draft.provider === "codex"
            ? "your Codex login"
            : draft.provider === "openrouter"
              ? "OpenRouter API credits"
              : draft.provider === "opencode"
                ? "OpenCode Go"
                : "local Ollama"}{" "}
          to plan. No audio is charged yet.
        </p>
      </aside>
      <section className="studio-work">
        <div className="section-heading">
          <div>
            <InkHeading>Audio studio</InkHeading>
          </div>
          <Headphones size={26} strokeWidth={1.5} />
        </div>
        {!speechConnected && (
          <div className="connection-note">
            <Volume2 size={18} />
            <p>
              Connect{" "}
              {(e?.settings || draft).ttsProvider === "cartesia"
                ? "Cartesia"
                : "Google Cloud"}{" "}
              in Settings to create audio, or choose a connected provider in
              voice settings. You can plan and edit scripts first.
            </p>
            <Button icon={ArrowUpRight} variant="quiet" onClick={settings}>
              Set up
            </Button>
          </div>
        )}
        {!e ? (
          <div className="studio-empty">
            <div className="record-art" aria-hidden="true">
              <div />
              <span>LM</span>
            </div>
            <h3>No episode planned yet</h3>
            <p>
              Start with an outline. Review what each chapter covers, generate
              the dialogue, then listen to a short voice preview.
            </p>
            <div className="studio-process">
              <span>Outline</span>
              <ArrowRight size={14} />
              <span>Script</span>
              <ArrowRight size={14} />
              <span>Listen</span>
            </div>
            {(!n.sources.length || !n.objectives.length) && (
              <p className="inline-error">
                Add sources and learning goals before planning.
              </p>
            )}
          </div>
        ) : (
          <>
            {n.episodes.length > 1 && (
              <Field label="Episode">
                <InkSelect
                  value={e.id}
                  onChange={(ev) => {
                    setEid(ev.target.value);
                    setCid("");
                  }}
                >
                  {n.episodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.title} · {new Date(ep.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </InkSelect>
              </Field>
            )}
            <div className="episode-title">
              <span className="badge">
                {e.status === "complete"
                  ? "Ready to listen"
                  : hasScript
                    ? "Script ready"
                    : "Episode outline"}
              </span>
              <h3>{e.title}</h3>
              <p>
                {e.settings.language === "nl" ? "Nederlands" : "English"} ·{" "}
                {e.settings.depth} · {e.settings.minutes} min target
                {totalWords > 0 && ` · ${durationLabel(totalWords)} scripted`}
                {` · ${episodeCartesia ? "Cartesia · Sonic 3.6" : "Google speech"}`}
              </p>
            </div>
            {e.error && (
              <div className="alert error">
                <CircleAlert size={18} />
                <span>{e.error}</span>
              </div>
            )}
            <MotionNavigation
              as="div"
              activeKey={c?.id || ""}
              itemsKey={e.chapters.map((chapter) => chapter.id).join(":")}
              selector="button.active"
              vertical
              className="chapter-list"
            >
              {e.chapters.map((ch, i) => (
                <InkButton
                  key={ch.id}
                  className={`chapter-row ${c?.id === ch.id ? "active" : ""}`}
                  onClick={() => {
                    setCid(ch.id);
                    setSourceReader(null);
                  }}
                >
                  <span className="chapter-index">
                    {ch.audioFile ? (
                      <Play size={16} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{ch.title}</strong>
                    <small>
                      {ch.objectiveIds.length} learning goals ·{" "}
                      {ch.turns.length
                        ? `${chapterWords.get(ch.id)?.toLocaleString()} words`
                        : "Outline ready"}
                    </small>
                  </span>
                  {ch.audioFile ? (
                    <Headphones size={17} />
                  ) : ch.turns.length ? (
                    <Check size={17} />
                  ) : (
                    <ChevronRight size={17} />
                  )}
                </InkButton>
              ))}
            </MotionNavigation>
            {hasScript && qualityWarnings.length > 0 && (
              <details className="script-checks">
                <summary>
                  Script checks · {qualityWarnings.length} point
                  {qualityWarnings.length === 1 ? "" : "s"} to review
                </summary>
                <p>
                  These checks look at length, repetition and source links. They
                  do not verify whether the explanations are correct.
                </p>
                <ul>
                  {qualityWarnings.map((warning, i) => (
                    <li key={`${warning.chapterId}-${warning.code}-${i}`}>
                      <strong>
                        {e.chapters.find((ch) => ch.id === warning.chapterId)
                          ?.title || "Episode"}
                        :{" "}
                      </strong>
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <details className="script-checks episode-voice-change">
              <summary>Voices for this episode</summary>
              <p>
                Change the voices or audio quality without rewriting the script.
                If audio already exists, saving creates a separate episode copy.
              </p>
              <SpeechSettings
                value={episodeVoices}
                onChange={setEpisodeVoices}
                disabled={disabled}
                connected={!!status?.cartesia}
              />
              <DraftNotice
                error={episodeVoiceDraft.error}
                restored={episodeVoiceDraft.restored}
              />
              {episodeVoiceError && (
                <p className="inline-error">{episodeVoiceError}</p>
              )}
              <Button
                icon={Check}
                disabled={
                  disabled || !!episodeVoiceError || !episodeVoicesChanged
                }
                onClick={() =>
                  void run("Saving episode voices", async () => {
                    const result = await api<{
                      episodeId: string;
                      copied: boolean;
                    }>(
                      `/notebooks/${n.id}/episodes/${e.id}/speech`,
                      "PUT",
                      speechSettingsSchema.parse(episodeVoices),
                    );
                    episodeVoiceDraft.accept();
                    await refresh();
                    setEid(result.episodeId);
                    if (result.copied) setCid("");
                  })
                }
              >
                Save episode voices
              </Button>
              {(episodeVoiceDraft.changed || episodeVoiceDraft.error) && (
                <Button
                  variant="quiet"
                  disabled={disabled}
                  onClick={episodeVoiceDraft.discard}
                >
                  Discard voice draft
                </Button>
              )}
            </details>
            {episodeVoicesChanged && (
              <p className="fine-print" role="status">
                Save episode voices to use your changes in the next preview or
                generation.
              </p>
            )}
            <div className="episode-actions">
              {!hasScript && (
                <Button
                  icon={Sparkles}
                  variant="primary"
                  disabled={disabled}
                  onClick={startScript}
                >
                  {totalWords ? "Continue script" : "Write the dialogue"}
                </Button>
              )}
              {hasScript && (
                <>
                  <Button
                    icon={Volume2}
                    disabled={
                      disabled ||
                      !speechConnected ||
                      episodeVoicesChanged ||
                      !!voiceSelectionError(e.settings)
                    }
                    onClick={() => audioAction(true)}
                  >
                    Voice preview
                  </Button>
                  {!fullAudio ? (
                    <Button
                      icon={Headphones}
                      variant="audio-button"
                      disabled={
                        disabled ||
                        !speechConnected ||
                        episodeVoicesChanged ||
                        !!voiceSelectionError(e.settings)
                      }
                      onClick={() => audioAction(false)}
                    >
                      Generate audio · {speechEstimate}
                    </Button>
                  ) : (
                    <DownloadLink
                      className="button primary"
                      href={`/api/notebooks/${n.id}/episodes/${e.id}/download?format=${status?.mp3 ? "mp3" : "wav"}`}
                      filename={`${e.title}.${status?.mp3 ? "mp3" : "wav"}`}
                    >
                      <Download size={17} /> Download{" "}
                      {status?.mp3 ? "MP3" : "WAV"}
                    </DownloadLink>
                  )}
                </>
              )}
            </div>
            {e.chapters.some((ch) => ch.audioFile || ch.audioLocked) && (
              <details className="script-checks">
                <summary>Revise this episode</summary>
                <p>
                  Make an editable copy of the script with the same sources,
                  learning goals and settings. Your existing audio stays with
                  this version. Generate new audio when your edits are ready.
                </p>
                <Button
                  icon={Pencil}
                  disabled={disabled}
                  onClick={() =>
                    void run("Copying episode", async () => {
                      const copy = await api<{ episodeId: string }>(
                        `/notebooks/${n.id}/episodes/${e.id}/revision`,
                        "POST",
                      );
                      await refresh();
                      setEid(copy.episodeId);
                      setCid("");
                    })
                  }
                >
                  Make editable copy
                </Button>
              </details>
            )}
            {hasScript && !fullAudio && (
              <p className="fine-print">
                {episodeCartesia
                  ? `Full-script estimate: ~${episodeCredits.toLocaleString()} credits, before normalization and retries. Preview generates the first segment from each host and uses credits too. Completed segments are reused, so remaining usage may be lower. Check your balance in Cartesia.`
                  : "Estimate is based on this script. Preview generates the first short segment. Full generation uses paid Google Cloud speech; eligible credits may offset it. Completed segments are reused."}
              </p>
            )}
            {e.previewFile && (
              <div className="audio-player">
                <span>Voice preview · AI-generated speech</span>
                <InkAudio controls src={`/api/audio/${e.previewFile}`} />
              </div>
            )}
            {c && (
              <section className="transcript">
                <div className="section-heading">
                  <div>
                    <span className="kicker">
                      {c.turns.length ? "Chapter transcript" : "Chapter brief"}
                    </span>
                    <h3>{c.title}</h3>
                  </div>
                  {c.turns.length > 0 && !c.audioFile && !c.audioLocked && (
                    <Button
                      icon={Pencil}
                      variant="quiet"
                      disabled={disabled}
                      onClick={() => {
                        setEditing(!editing);
                      }}
                    >
                      {editing
                        ? "Close editor"
                        : script !== savedScript
                          ? "Resume edits"
                          : "Edit"}
                    </Button>
                  )}
                </div>
                <p className="chapter-summary">{c.summary}</p>
                {(c.context || e.context) && (
                  <ContextSummary
                    key={c.id}
                    summary={(c.context || e.context)!}
                    sources={e.sources || n.sources}
                    onOpenSource={(sourceId, _quote, startSeconds, range) => {
                      const source = episodeSources.find(
                        (item) => item.id === sourceId,
                      );
                      setSourceReader(
                        source
                          ? {
                              source,
                              range,
                              startSeconds,
                              episodeId: e.id,
                              trigger:
                                document.activeElement instanceof HTMLElement
                                  ? document.activeElement
                                  : null,
                            }
                          : null,
                      );
                    }}
                  />
                )}
                <div className="chapter-goals">
                  {c.objectiveIds.map((oid) => (
                    <span key={oid}>
                      <Target size={13} />
                      {episodeObjectives.find((o) => o.id === oid)?.text ||
                        "Goal removed after this episode was planned"}
                    </span>
                  ))}
                </div>
                {e.chapters.some((ch) => ch.audioFile) && (
                  <EpisodePlayer
                    key={e.id}
                    episode={e}
                    activeChapterId={c.id}
                    onChapterChange={setCid}
                  />
                )}
                {editing ? (
                  <form
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      void run("Saving transcript", async () => {
                        const turns = parseEditedScript(script, c.turns);
                        await change(
                          `/notebooks/${n.id}/episodes/${e.id}/chapters/${c.id}`,
                          "PUT",
                          turns,
                        );
                        const canonicalScript = turns
                          .map((t) => `${t.speaker}: ${t.text}`)
                          .join("\n\n");
                        if (
                          scriptDraft.accept(script, canonicalScript) &&
                          currentScriptKey.current === scriptKey
                        )
                          setEditing(false);
                      });
                    }}
                  >
                    <Field
                      label="Dialogue"
                      hint="Use A: and B: for speaker turns. Edited passages lose their old source links until reviewed."
                    >
                      <InkTextarea
                        rows={18}
                        value={script}
                        onChange={(ev) => setScript(ev.target.value)}
                      />
                    </Field>
                    <DraftNotice
                      error={scriptDraft.storageError}
                      restored={scriptDraft.restored}
                    />
                    <div className="actions end">
                      <Button onClick={() => setEditing(false)}>
                        Keep draft and close
                      </Button>
                      {script !== savedScript && (
                        <Button
                          onClick={async () => {
                            if (
                              await confirmInk(
                                "Your saved transcript stays unchanged. These unsaved edits will be removed.",
                                "Discard transcript edits?",
                                "Discard edits",
                              )
                            ) {
                              scriptDraft.discard();
                              setEditing(false);
                            }
                          }}
                        >
                          Discard edits
                        </Button>
                      )}
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={disabled}
                      >
                        Save transcript
                      </Button>
                    </div>
                  </form>
                ) : (
                  c.turns.map((turn, i) => (
                    <div
                      className={`turn host-${turn.speaker.toLowerCase()}`}
                      key={i}
                    >
                      <span className="host-avatar">{turn.speaker}</span>
                      <div>
                        <strong>Host {turn.speaker}</strong>
                        <p>{turn.text}</p>
                        {turn.sourceIds.length > 0 && (
                          <div className="turn-sources">
                            {turn.sourceIds.map((sourceId) => (
                              <InkButton
                                key={sourceId}
                                onClick={() => {
                                  const source = episodeSources.find(
                                    (item) => item.id === sourceId,
                                  );
                                  setSourceReader(
                                    source
                                      ? {
                                          source,
                                          episodeId: e.id,
                                          trigger:
                                            document.activeElement instanceof
                                            HTMLElement
                                              ? document.activeElement
                                              : null,
                                        }
                                      : null,
                                  );
                                }}
                              >
                                <FileText size={12} />
                                {episodeSources.find((s) => s.id === sourceId)
                                  ?.title || "Source removed"}
                              </InkButton>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {sourceReader && sourceReader.episodeId === e.id && (
                  <SourceSnapshotReader
                    source={sourceReader.source}
                    notebookId={n.id}
                    episodeId={e.sources ? e.id : undefined}
                    range={sourceReader.range}
                    startSeconds={sourceReader.startSeconds}
                    onClose={() => {
                      const trigger = sourceReader.trigger;
                      setSourceReader(null);
                      if (trigger?.isConnected)
                        trigger.focus({ preventScroll: true });
                    }}
                  />
                )}
              </section>
            )}
          </>
        )}
        <ActivityHistory
          notebookId={n.id}
          refreshKey={`${n.updatedAt}:${activityRevision}:${status?.activeJobs[n.id] || "idle"}`}
        />
      </section>
    </div>
  );
}
function Chat({
  n,
  disabled,
  run,
  change,
  openSource,
}: WorkProps & { openSource: OpenSource }) {
  const initialMessageIds = useMemo(
    () => new Set(n.messages.map((message) => message.id)),
    [n.id],
  );
  const questionDraft = useDraftText(`${n.id}:question`, "", 6000);
  const { text: message, setText: setMessage } = questionDraft;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({
      block: "nearest",
      behavior: canAnimate() ? "smooth" : "instant",
    });
  }, [n.messages.length]);
  return (
    <section className="chat">
      <div className="section-heading">
        <div>
          <InkHeading>Ask your sources</InkHeading>
          <p>Ask about this notebook. Open citations to check an answer.</p>
        </div>
        <MessageSquare size={24} />
      </div>
      {!n.messages.length ? (
        <div className="chat-empty">
          <BookOpen size={40} strokeWidth={1} />
          <h3>What would you like to know?</h3>
          <p>
            Ask for a mechanism, challenge an argument, or connect two ideas.
          </p>
          <div className="suggestions">
            {[
              "Which important qualifications should I understand?",
              "Where do these sources agree or disagree?",
              "Explain the mechanism behind the central argument.",
            ].map((q) => (
              <InkButton key={q} onClick={() => setMessage(q)}>
                {q}
                <ArrowUpRight size={15} />
              </InkButton>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages">
          {n.messages.map((m, index) => (
            <article
              key={m.id}
              className={`message ${m.role}${index === n.messages.length - 1 && !initialMessageIds.has(m.id) ? " message-latest" : ""}`}
            >
              <span className="message-label">
                {m.role === "user" ? "You" : "LMBook"}
              </span>
              <div className="message-text">{m.text}</div>
              {m.role === "assistant" && m.evidence?.length === 0 && (
                <p className="fine-print">
                  No direct source quote was verified for this answer. Check it
                  against the consulted passages.
                </p>
              )}
              {m.evidence && (
                <EvidenceList
                  evidence={m.evidence}
                  n={n}
                  snapshots={m.sources}
                  onOpenSource={(
                    sourceId,
                    quote,
                    startSeconds,
                    range,
                    snapshot,
                  ) =>
                    openSource(
                      sourceId,
                      quote,
                      startSeconds,
                      range,
                      snapshot,
                      snapshot ? m.id : undefined,
                    )
                  }
                />
              )}
              {m.context && (
                <ContextSummary
                  summary={m.context}
                  sources={[
                    ...(m.sources || []),
                    ...n.sources.filter(
                      (source) =>
                        !m.sources?.some((saved) => saved.id === source.id),
                    ),
                  ]}
                  onOpenSource={(sourceId, quote, startSeconds, range) => {
                    const snapshot = m.sources?.find(
                      (source) => source.id === sourceId,
                    );
                    openSource(
                      sourceId,
                      quote,
                      startSeconds,
                      range,
                      snapshot,
                      snapshot ? m.id : undefined,
                    );
                  }}
                />
              )}
            </article>
          ))}
          <div ref={end} />
        </div>
      )}
      <form
        className="chat-composer ink-writing-surface"
        onSubmit={(e) => {
          e.preventDefault();
          void run("Reading your sources", async () => {
            await change(`/notebooks/${n.id}/chat`, "POST", { message });
            questionDraft.accept(message);
          });
        }}
      >
        <InkTextarea
          rows={2}
          surface
          aria-label="Question for your sources"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask a question about your sources…"
          maxLength={6000}
        />
        <Button
          type="submit"
          variant="primary"
          icon={Send}
          disabled={disabled || !message.trim() || !n.sources.length}
        >
          Ask
        </Button>
        <InkStroke />
      </form>
      <DraftNotice
        error={questionDraft.storageError}
        restored={questionDraft.restored}
      />
      <p className="fine-print">
        Uses the provider selected in Settings. Quotes are checked against
        source text; interpretations still need your judgment.
      </p>
    </section>
  );
}
function Connections({
  n,
  status,
  disabled,
  save,
  rename,
  remove,
  refreshStatus,
  restore,
  trashRefreshKey,
  onNotebookRestored,
}: {
  n: Notebook | null;
  status: Capabilities | null;
  disabled: boolean;
  save: (
    provider: Settings["provider"],
    model: string,
    onSaved: () => void,
  ) => Promise<void>;
  rename: (
    title: string,
    description: string,
    onSaved: () => void,
  ) => Promise<void>;
  remove: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  restore: (file: File) => Promise<void>;
  trashRefreshKey: number;
  onNotebookRestored: (id: string) => Promise<void>;
}) {
  const providerDraft = useObjectDraft(
    `${n?.id || "none"}:provider`,
    n?.settings || settingsSchema.parse({}),
    ["provider", "model"],
  );
  const { value: draft, setValue: setDraft } = providerDraft;
  const detailsDraft = useObjectDraft(
    `${n?.id || "none"}:notebook-details`,
    { title: n?.title || "", description: n?.description || "" },
    ["title", "description"],
  );
  const { title, description } = detailsDraft.value;
  const setTitle = (title: string) =>
    detailsDraft.setValue({ title, description });
  const setDescription = (description: string) =>
    detailsDraft.setValue({ title, description });
  const bundleInput = useRef<HTMLInputElement>(null);
  return (
    <MotionSurface motionKey="settings" className="settings-page">
      <div className="page-heading">
        <div>
          <h1>Connections & settings</h1>
          <p>Connect your accounts and manage saved notebooks.</p>
        </div>
      </div>
      <section className="settings-section">
        <div>
          <h2>Appearance</h2>
          <p>Choose paper, ink and accent colors.</p>
        </div>
        <div className="settings-body">
          <AppearanceSetup />
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Thinking & writing</h2>
          <p>
            Select the provider for source chat, coverage and episode scripts.
            Configuration is saved per notebook.
          </p>
        </div>
        <div className="settings-body">
          <div className="connection-list">
            {[
              ["Codex CLI", status?.codex, "Installed · login not verified"],
              [
                "OpenCode Go",
                status?.opencode,
                status?.opencodeCli
                  ? "CLI installed · login not verified"
                  : "API key configured",
              ],
              ["Local Ollama", status?.ollama, "Local server reachable"],
            ].map(([label, available, detail]) => (
              <div key={String(label)}>
                <span>{label}</span>
                <span className={`badge ${available ? "covered" : "unmapped"}`}>
                  {available ? detail : "Not configured"}
                </span>
              </div>
            ))}
          </div>
          <CodexSetup />
          {n ? (
            <>
              <DraftNotice
                error={providerDraft.error}
                restored={providerDraft.restored}
              />
              <Field label="Notebook provider">
                <InkSelect
                  value={draft.provider}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      provider: e.target.value as Settings["provider"],
                      model: "",
                    })
                  }
                >
                  <option value="codex">Codex CLI · existing login</option>
                  <option value="openrouter">OpenRouter · API credits</option>
                  <option value="opencode">
                    OpenCode Go · existing login or key
                  </option>
                  <option value="ollama">Ollama · local model</option>
                </InkSelect>
              </Field>
              <Field
                label="Model ID"
                hint={
                  draft.provider === "codex"
                    ? "Leave blank for the Codex default."
                    : draft.provider === "openrouter"
                      ? "Choose an OpenRouter writing model below, or enter its exact ID. Luna uses Codex."
                      : draft.provider === "opencode"
                        ? status?.opencodeCli
                          ? "Leave blank for Muse Spark 1.3 Contributor, or enter a Go model ID."
                          : "Enter a Go model with a chat/completions endpoint."
                        : "Leave blank for qwen3:8b, or enter an installed Ollama model."
                }
              >
                <InkInput
                  value={draft.model}
                  maxLength={100}
                  onChange={(e) =>
                    setDraft({ ...draft, model: e.target.value })
                  }
                  placeholder={
                    draft.provider === "codex"
                      ? "Codex default"
                      : draft.provider === "openrouter"
                        ? "provider/model"
                        : draft.provider === "opencode"
                          ? "muse-spark-1.3-contributor"
                          : "qwen3:8b"
                  }
                />
              </Field>
              {draft.provider === "openrouter" && (
                <OpenRouterModelPicker
                  value={draft.model}
                  onChange={(model) => setDraft({ ...draft, model })}
                  disabled={disabled}
                />
              )}
              <Button
                variant="primary"
                icon={Check}
                disabled={disabled}
                onClick={() =>
                  void save(draft.provider, draft.model, providerDraft.accept)
                }
              >
                Save provider
              </Button>
              {(providerDraft.changed || providerDraft.error) && (
                <Button
                  variant="quiet"
                  disabled={disabled}
                  onClick={providerDraft.discard}
                >
                  Discard provider draft
                </Button>
              )}
            </>
          ) : (
            <p>Create a notebook to choose its provider.</p>
          )}
          <details>
            <summary>Connection instructions</summary>
            <p>
              <strong>Codex:</strong> install the CLI and run{" "}
              <code>codex login</code>. LMBook connects through Codex App Server
              using your local login. Your subscription or API billing and usage
              limits apply.
            </p>
            <p>
              <strong>OpenCode Go:</strong> install OpenCode and connect your Go
              account. LMBook can reuse that local login. Alternatively, add{" "}
              <code>OPENCODE_API_KEY</code> to the local <code>.env</code> file
              and select a chat/completions model.
            </p>
            <p>
              Go describes its subscription as intended for coding-agent
              traffic. Permission for lesson generation is unconfirmed; use
              Codex or a normal API service for this workflow.
            </p>
            <p>
              <strong>Ollama:</strong> run Ollama locally and install your
              preferred model. The app connects to port 11434 by default. Small
              models may struggle with lengthy sources or structured output.
            </p>
          </details>
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Hosted models</h2>
          <p>
            Use OpenRouter for optional models. Your Luna subscription
            connection stays separate.
          </p>
        </div>
        <div className="settings-body">
          <OpenRouterSetup />
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Google speech</h2>
          <p>
            Two-speaker audio in English and Dutch, billed through your Google
            Cloud project.
          </p>
          <a
            href="https://me.developers.google.com/benefits"
            target="_blank"
            rel="noreferrer"
          >
            Claim included developer credits <ExternalLink size={13} />
          </a>
        </div>
        <div className="settings-body">
          <GoogleSetup
            configuredProject={status?.googleProject || ""}
            saveProject={async (googleProject) => {
              await api("/connections/google", "POST", { googleProject });
              await refreshStatus();
            }}
            checkConnection={() =>
              api<{ ok: boolean; message: string }>(
                "/connections/google/check",
                "POST",
              )
            }
          />
        </div>
      </section>
      <section className="settings-section" id="cartesia-connection">
        <div>
          <h2>Cartesia speech</h2>
          <p>
            Use your Cartesia subscription for English and Dutch episode voices.
            Choose the two hosts in the audio studio.
          </p>
        </div>
        <div className="settings-body">
          <CartesiaSetup
            configured={!!status?.cartesia}
            disabled={
              disabled || !!Object.keys(status?.activeJobs || {}).length
            }
            connect={async (apiKey) => {
              const result = await api<{ message: string }>(
                "/connections/cartesia",
                "POST",
                { apiKey },
              );
              await refreshStatus();
              return result;
            }}
            disconnect={async () => {
              await api("/connections/cartesia", "DELETE");
              await refreshStatus();
            }}
            check={async () => {
              await api("/cartesia/voices");
            }}
          />
        </div>
      </section>
      <section className="settings-section" id="local-transcription">
        <div>
          <h2>Local AI models</h2>
          <p>
            Choose what runs on your computer, with recommendations for your
            hardware.
          </p>
        </div>
        <div className="settings-body">
          <LocalModelsSetup />
        </div>
      </section>
      <section className="settings-section">
        <div>
          <h2>Your library</h2>
          <p>
            Notebooks are saved in a local SQLite database. Export a readable
            copy whenever you like.
          </p>
        </div>
        <div className="settings-body">
          {window.sennibookDesktop && <DesktopDetails />}
          <MotionPreferences />
          <h3>Notebook backups</h3>
          <p>
            A ZIP backup includes notes, saved source evidence, episode scripts
            and audio. Restore creates a new notebook and keeps your existing
            library intact.
          </p>
          <div className="actions">
            {n && (
              <DownloadLink
                className="button"
                href={`/api/notebooks/${n.id}/bundle`}
                filename={`${n.title}.zip`}
              >
                <Download size={16} /> Back up this notebook
              </DownloadLink>
            )}
            <Button
              icon={Upload}
              disabled={disabled}
              onClick={() => bundleInput.current?.click()}
            >
              Restore a notebook
            </Button>
            <InkInput
              ref={bundleInput}
              type="file"
              accept=".zip"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void restore(file);
              }}
            />
          </div>
          <p className="fine-print">
            LMBook ZIP format · up to 2 GB. Includes saved originals and
            transcripts. Older imports may only have extracted text; import
            those files again to preserve their originals.
          </p>
          {n && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void rename(title, description, detailsDraft.accept);
              }}
            >
              <DraftNotice
                error={detailsDraft.error}
                restored={detailsDraft.restored}
              />
              <Field label="Notebook title">
                <InkInput
                  value={title}
                  required
                  maxLength={150}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field label="Notebook description">
                <InkTextarea
                  rows={2}
                  value={description}
                  maxLength={2000}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <div className="actions">
                <Button type="submit" disabled={disabled} icon={Check}>
                  Save notebook details
                </Button>
                {(detailsDraft.changed || detailsDraft.error) && (
                  <Button
                    variant="quiet"
                    disabled={disabled}
                    onClick={detailsDraft.discard}
                  >
                    Discard details draft
                  </Button>
                )}
                <Button
                  variant="quiet"
                  disabled={disabled}
                  icon={Trash2}
                  onClick={() => void remove()}
                >
                  Move notebook to Trash
                </Button>
              </div>
            </form>
          )}
          <NotebookTrash
            disabled={
              disabled || !!Object.keys(status?.activeJobs || {}).length
            }
            refreshKey={trashRefreshKey}
            onRestored={onNotebookRestored}
          />
          <h3>Readable Markdown export</h3>
          <p>
            Exports contain sources, objectives and episode transcripts. They
            open in any Markdown editor, including Obsidian if you choose to use
            it later.
          </p>
          {n && (
            <DownloadLink
              className="button"
              href={`/api/notebooks/${n.id}/export`}
              filename={`${n.title}.md`}
            >
              <Download size={16} /> Export this notebook
            </DownloadLink>
          )}
          <details>
            <summary>What this first edition does and doesn’t do</summary>
            <p>
              PDF, Word, PowerPoint, HTML and Markdown import; printed-page text
              recognition; local recording transcription; goals and concepts;
              quoted coverage; source chat; editable subject profiles; chapter
              scripts; Google speech previews, chapter audio, WAV and MP3
              downloads.
            </p>
            <p>
              Automatic web-source collection, live Obsidian sync, local podcast
              voices and automatic knowledge assessment are still on the
              roadmap. Local transcription needs Python and a downloaded model.
              Source originals are kept with extracted text.
            </p>
          </details>
        </div>
      </section>
    </MotionSurface>
  );
}

function DesktopDetails() {
  const [info, setInfo] = useState<{
    version: string;
    dataPath: string;
    configPath: string;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    void window.sennibookDesktop
      ?.getInfo()
      .then(setInfo)
      .catch(() =>
        setError(
          "Desktop details are unavailable. Restart LMBook to try again.",
        ),
      );
  }, []);
  return (
    <div className="desktop-details">
      <h3>LMBook for desktop{info ? ` · ${info.version}` : ""}</h3>
      <p>
        Your notebooks stay on this computer. Closing the window during
        generation lets you choose whether to keep working in the system tray.
      </p>
      {info && (
        <details>
          <summary>Storage and connection settings</summary>
          <p>
            Notebook data: <code>{info.dataPath}</code>
          </p>
          <p>
            Connection configuration: <code>{info.configPath}</code>
          </p>
        </details>
      )}
      <Button
        variant="quiet"
        icon={Library}
        onClick={() => {
          void window.sennibookDesktop
            ?.openDataFolder()
            .then((message) => {
              if (message) setError(message);
            })
            .catch(() => setError("Could not open the data folder."));
        }}
      >
        Open data folder
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DownloadProvider>
      <App />
      <InkDialogHost />
      <InkTooltip />
    </DownloadProvider>
  </React.StrictMode>,
);
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has("theme-lab")
)
  void import("./theme-lab/ThemeLab");
