import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
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
  ChevronDown,
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
  Leaf,
  Sparkles,
  Square,
  Bookmark,
  Volume2,
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
} from "../shared/model";
import "./style.css";
import { evaluateEpisodeQuality } from "../shared/quality";
import { EpisodePlayer } from "./components/EpisodePlayer";
import { GoogleSetup } from "./components/GoogleSetup";
import { ActivityHistory } from "./components/ActivityHistory";
import { SourceAudio } from "./components/SourceAudio";
import { LocalTranscriptionSetup } from "./components/LocalTranscriptionSetup";
import { locateEvidence, locateSourceRange } from "../shared/evidence-location";
import { ContextSummary } from "./components/ContextSummary";
import { SourceSnapshotReader } from "./components/SourceSnapshotReader";
import { SourceOcr } from "./components/SourceOcr";
import { SourceImage } from "./components/SourceImage";
import { parseEditedScript } from "../shared/script-editor";
import { useDraftText } from "./hooks/useDraftText";

/* THESIS: a course becomes a conversation through visible evidence and goals.
OWN-WORLD: forest navigation, mineral paper, ochre listening controls, serif titles and quiet ledgers.
STORY: collect material, establish coverage, shape and listen to a precise conversation.
FIRST VIEWPORT: left notebook rail; wide title and three-step navigation; source ledger and next action.
FORM: reading-room workbench, chosen under user's explicit autonomous-build instruction. */

type Summary = {
  id: string;
  title: string;
  subject: string;
  sourceCount: number;
  example: boolean;
};
const priceLabel = (amount: number) =>
  amount > 0 && amount < 0.01 ? "<$0.01" : `$${amount.toFixed(2)}`;
const durationLabel = (wordCount: number) =>
  wordCount < 145 ? "<1 min" : `~${Math.round(wordCount / 145)} min`;
type Tab = "sources" | "goals" | "studio" | "chat" | "settings";
type SourceRequest = {
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
) => void;
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch("/api" + url, {
    method,
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
}: {
  children?: React.ReactNode;
  icon?: typeof Plus;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={17} />}
      <span>{children}</span>
    </button>
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
  const [notebooks, setNotebooks] = useState<Summary[]>([]);
  const [n, setN] = useState<Notebook | null>(null);
  const [tab, setTab] = useState<Tab>("sources");
  const [sourceRequest, setSourceRequest] = useState<SourceRequest | null>(
    null,
  );
  const openSource: OpenSource = (sourceId, quote, startSeconds, range) => {
    setSourceRequest(
      sourceId
        ? { sourceId, quote, startSeconds, range, nonce: Date.now() }
        : null,
    );
    setTab("sources");
  };
  const [status, setStatus] = useState<Capabilities | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [openingNotebook, setOpeningNotebook] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [notice, setNotice] = useState("");
  const selected = useRef<string | null>(null);
  const selectionRequest = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const loadList = async () => {
    const list = await api<Summary[]>("/notebooks");
    setNotebooks(list);
    return list;
  };
  const refresh = async () => {
    if (selected.current) {
      const current = selected.current;
      const book = await api<Notebook>("/notebooks/" + current);
      if (selected.current === current) setN(book);
    }
    await loadList();
  };
  const choose = async (id: string) => {
    const request = ++selectionRequest.current;
    setOpeningNotebook(id);
    setSourceRequest(null);
    selected.current = id;
    try {
      localStorage.setItem("sennibook:last", id);
    } catch {
      /* Remembering the last notebook is optional. */
    }
    setError("");
    try {
      const book = await api<Notebook>("/notebooks/" + id);
      if (selectionRequest.current === request) setN(book);
    } catch (error) {
      if (selectionRequest.current === request) {
        selected.current = n?.id || null;
        throw error;
      }
    } finally {
      if (selectionRequest.current === request) setOpeningNotebook(null);
    }
  };
  useEffect(() => {
    void (async () => {
      try {
        const [list, st] = await Promise.all([
          loadList(),
          api<Capabilities>("/status"),
        ]);
        setStatus(st);
        let last: string | null = null;
        try {
          last = localStorage.getItem("sennibook:last");
        } catch {
          /* Open the first notebook when preferences are unavailable. */
        }
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
    if (createOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [createOpen]);
  const pendingSourceProcessing = !!n?.sources.some((source) =>
    ["recognizing", "transcribing"].includes(source.processing?.status || ""),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      void api<Capabilities>("/status")
        .then((st) => {
          setStatus(st);
          if (
            selected.current &&
            (st.activeJobs[selected.current] ||
              status?.activeJobs[selected.current] ||
              pendingSourceProcessing)
          )
            void refresh().catch((e) => setError(e.message));
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [status?.activeJobs, n?.id, pendingSourceProcessing]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function run(label: string, work: () => Promise<void>) {
    if (busy && label !== "Cancelling") return;
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const change = async (url: string, method = "POST", body?: unknown) => {
    const current = selected.current;
    const book = await api<Notebook>(url, method, body);
    if (book.id && selected.current === current) setN(book);
    await loadList();
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
    setTab("sources");
    await loadList();
    await choose(book.id);
  };
  const job = !!(n && status?.activeJobs[n.id]);
  const disabled = !!busy || job || !!openingNotebook;
  const saveSettings = async (settings: Settings) => {
    if (n) await change(`/notebooks/${n.id}`, "PATCH", { settings });
  };
  return (
    <div className="app">
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
          SenniBook<span className="brand-dot">.</span>
        </a>
        <button
          className="mobile-create icon-button light"
          aria-label="New notebook"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={20} />
        </button>
        <div className="sidebar-intro">A deeper understanding.</div>
        <div className="rail-label">
          <span>Your notebooks</span>
          <button
            className="icon-button light"
            aria-label="Create notebook"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={18} />
          </button>
        </div>
        <nav className="notebook-list" aria-label="Notebooks">
          {notebooks.map((book) => (
            <button
              key={book.id}
              className={`notebook-item ${n?.id === book.id ? "selected" : ""}`}
              onClick={() =>
                void choose(book.id).catch((error: Error) =>
                  setError(error.message),
                )
              }
            >
              <BookOpen size={17} />
              <span>
                <strong>{book.title}</strong>
                <small>
                  {book.subject} · {book.sourceCount} sources
                </small>
              </span>
            </button>
          ))}
          {!notebooks.length && (
            <p className="rail-empty">Your courses will live here.</p>
          )}
        </nav>
        <Button
          icon={Plus}
          variant="rail-new"
          onClick={() => setCreateOpen(true)}
        >
          New notebook
        </Button>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="status-dot" /> Saved on this computer
          </div>
          <button
            className={`rail-settings ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            <Settings2 size={18} /> Connections & settings
          </button>
          <div className="rail-foot">
            SenniBook <span>Early edition · 0.2</span>
          </div>
        </div>
      </aside>
      <main id="main" className="main">
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
                {busy || "Opening notebook"}
              </>
            ) : job ? (
              <>
                <Radio size={14} /> Generation running
              </>
            ) : (
              <>
                <Check size={14} />{" "}
                {window.sennibookDesktop
                  ? "Desktop workspace"
                  : "Local workspace"}
              </>
            )}
          </span>
        </header>
        {error && (
          <div className="alert error" role="alert">
            <CircleAlert size={19} />
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={17} />
            </button>
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
                const data = new FormData();
                data.append("file", file);
                const restored = await api<Notebook>(
                  "/notebooks/import",
                  "POST",
                  data,
                );
                await loadList();
                await choose(restored.id);
                setTab("sources");
                setNotice("Notebook restored as a new copy");
              })
            }
            key={n?.id || "settings"}
            n={n}
            status={status}
            disabled={disabled}
            save={(settings) =>
              run("Saving settings", async () => {
                await saveSettings(settings);
                setNotice("Settings saved");
              })
            }
            onBack={() => setTab("sources")}
            rename={(title, description) =>
              run("Saving notebook", async () => {
                if (n) {
                  await change(`/notebooks/${n.id}`, "PATCH", {
                    title,
                    description,
                  });
                  setNotice("Notebook updated");
                }
              })
            }
            remove={() =>
              run("Removing notebook", async () => {
                if (!n) return;
                await api(`/notebooks/${n.id}`, "DELETE");
                const list = await loadList();
                // A completed removal must not move someone away from a
                // different notebook they selected while the request ran.
                if (selected.current !== n.id) return;
                ++selectionRequest.current;
                selected.current = null;
                setN(null);
                try {
                  localStorage.removeItem("sennibook:last");
                } catch {
                  /* The library remains usable without this preference. */
                }
                if (list.length) await choose(list[0].id);
                setTab("sources");
              })
            }
          />
        ) : !n ? (
          <div className="welcome">
            <div className="welcome-heading">
              <span className="kicker">Your next chapter starts here</span>
              <h1>
                Your material.
                <br />A deeper conversation.
              </h1>
              <p>
                Bring your course notes, concepts and learning goals together.
                Turn them into a conversation worth taking on a walk.
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
                <span>
                  A space for
                  <br />
                  <em>understanding.</em>
                </span>
                <div className="book-bottom">
                  SOURCES → IDEAS → CONVERSATION
                </div>
              </div>
            </div>
            <div className="welcome-steps">
              <div>
                <FileText size={21} />
                <h3>Bring your material</h3>
                <p>PDFs, notes and the sources you trust.</p>
              </div>
              <div>
                <Target size={21} />
                <h3>Know what matters</h3>
                <p>Let your begrippen and leerdoelen guide the depth.</p>
              </div>
              <div>
                <Headphones size={21} />
                <h3>Make room to listen</h3>
                <p>Two voices. Your pace. A fuller explanation.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <div className="kicker">
                  {n.example
                    ? "Illustrative example notebook"
                    : "Learning notebook"}
                </div>
                <h1>{n.title}</h1>
                <p>
                  {n.description ||
                    "Collect the evidence. Follow the questions. Go a little further."}
                </p>
              </div>
              <a
                className="button quiet"
                href={`/api/notebooks/${n.id}/export`}
              >
                <Download size={16} /> Export notes
              </a>
            </section>
            <nav className="tabs" aria-label="Notebook sections">
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
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}
                >
                  <t.icon size={18} />
                  {t.label}
                  {"count" in t && <span className="tab-count">{t.count}</span>}
                </button>
              ))}
            </nav>
            <div className="page-content">
              {job && (
                <div className="job-banner" role="status">
                  <LoaderCircle className="spin" size={18} />
                  <span>
                    {n.episodes.find(
                      (e) => e.status === "script" || e.status === "audio",
                    )?.progress || status?.activeJobs[n.id]}
                    <small>
                      You can switch notebooks. Keep the local server running.
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
                  settings={() => setTab("settings")}
                  request={sourceRequest}
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
                  run={run}
                  change={change}
                  refresh={refresh}
                  saveSettings={saveSettings}
                  settings={() => setTab("settings")}
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
            </div>
          </>
        )}
        <footer className="page-footer">
          <Leaf size={14} /> Built for curiosity. Kept under your control.
          <span>AI explanations deserve a source check.</span>
        </footer>
      </main>
      <dialog
        ref={dialog}
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
            <h2>A new place to learn</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close"
              onClick={() => setCreateOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p>One notebook for a course, topic or question.</p>
          <Field label="Notebook name">
            <input
              autoFocus
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
}: WorkProps & {
  next: () => void;
  refresh: () => Promise<void>;
  settings: () => void;
  request: SourceRequest | null;
}) {
  const sourceTitleDraft = useDraftText(`${n.id}:source-title`, "", 200);
  const sourceTextDraft = useDraftText(`${n.id}:source-text`, "", 1_000_000);
  const { text: title, setText: setTitle } = sourceTitleDraft;
  const { text, setText } = sourceTextDraft;
  const [adding, setAdding] = useState(Boolean(title || text));
  const sourceKindDraft = useDraftText(`${n.id}:source-kind`, "course", 20);
  const kind = sourceKindDraft.text === "supplement" ? "supplement" : "course";
  const setKind = sourceKindDraft.setText;
  const [reading, setReading] = useState<SourceRequest | null>(request);
  const selected =
    n.sources.find((source) => source.id === reading?.sourceId) || null;
  const reader = useRef<HTMLDivElement>(null);
  const highlight = useRef<HTMLElement>(null);
  const location =
    selected && reading?.range
      ? locateSourceRange(
          selected,
          reading.range.startOffset,
          reading.range.endOffset,
        )
      : selected && reading?.quote
        ? locateEvidence(selected, reading.quote)
        : undefined;
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
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    target?.focus({ preventScroll: true });
  }, [reading]);
  const [query, setQuery] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    await run("Importing sources", async () => {
      for (const f of Array.from(files)) {
        const data = new FormData();
        data.append("file", f);
        data.append("kind", kind);
        const audio = /\.(mp3|wav|m4a|mp4|flac|ogg|opus|aac|webm)$/i.test(
          f.name,
        );
        await change(
          `/notebooks/${n.id}/${audio ? "audio-source" : "upload"}`,
          "POST",
          data,
        );
      }
    });
    if (file.current) file.current.value = "";
  };
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>The material behind the conversation</h2>
          <p>Original sources stay separate from added context.</p>
        </div>
        <Button
          icon={Plus}
          onClick={() => setAdding(!adding)}
          disabled={disabled}
        >
          Paste a source
        </Button>
      </div>
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
          <strong>Add something worth understanding</strong>
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
        <input
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
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Article, chapter or lecture title"
                maxLength={200}
              />
            </Field>
            <Field label="Source type">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                <option value="course">Course material</option>
                <option value="supplement">Supplementary source</option>
              </select>
            </Field>
          </div>
          <Field label="Source text">
            <textarea
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
          {n.sources
            .reduce((sum, s) => sum + words(s.text), 0)
            .toLocaleString()}{" "}
          words
        </span>
        <label className="search">
          <Search size={16} />
          <input
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
      ) : (
        <div className="source-list">
          {n.sources
            .filter((s) =>
              `${s.title} ${s.text}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((s, i) => (
              <div className="source-row" key={s.id}>
                <div className="file-symbol">
                  {s.attachment?.mediaType.startsWith("audio/") ? (
                    <Headphones size={20} />
                  ) : (
                    <FileText size={20} />
                  )}
                </div>
                <button
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
                            : `${words(s.text).toLocaleString()} words`}
                  </span>
                </button>
                <span className="source-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <button
                  className="icon-button"
                  title="Read source"
                  aria-label={`Read ${s.title}`}
                  onClick={() =>
                    setReading({ sourceId: s.id, nonce: Date.now() })
                  }
                >
                  <ArrowUpRight size={18} />
                </button>
                <button
                  disabled={disabled}
                  className="icon-button delete"
                  aria-label={`Remove ${s.title}`}
                  onClick={() => {
                    if (
                      confirm(
                        `Remove “${s.title}” from this notebook? Existing episodes retain their saved source snapshots. The current coverage map will be cleared.`,
                      )
                    )
                      void run("Removing source", () =>
                        change(`/notebooks/${n.id}/sources/${s.id}`, "DELETE"),
                      );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
        </div>
      )}
      {n.sources.length > 0 && (
        <div className="next-step">
          <div>
            <Target size={23} />
            <span>
              <strong>Give your material a direction</strong>
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
        <div
          className="reader"
          ref={reader}
          tabIndex={-1}
          aria-label="Source reader"
        >
          <div className="section-heading">
            <div>
              <span className="kicker">Source text</span>
              <h2>{selected.title}</h2>
            </div>
            <Button icon={X} onClick={() => setReading(null)}>
              Close reader
            </Button>
          </div>
          {selected.attachment && (
            <a
              className="button quiet"
              href={`/api/notebooks/${n.id}/sources/${selected.id}/original`}
              download
            >
              <Download size={16} /> Download original
            </a>
          )}
          {selected.attachment &&
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
          <SourceImage key={selected.id} source={selected} notebookId={n.id} />
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
        </div>
      )}
    </>
  );
}
function EvidenceList({
  evidence,
  n,
  onOpenSource,
}: {
  evidence: Evidence[];
  n: Notebook;
  onOpenSource?: OpenSource;
}) {
  return (
    <div className="evidence-list">
      {evidence.map((e, i) => {
        const source = n.sources.find((s) => s.id === e.sourceId);
        const location = source ? locateEvidence(source, e.quote) : undefined;
        return (
          <blockquote key={i}>
            <p>“{e.quote}”</p>
            <cite>
              {source && onOpenSource ? (
                <button
                  className="evidence-link"
                  onClick={() =>
                    onOpenSource(source.id, e.quote, location?.startSeconds)
                  }
                >
                  <FileText size={13} /> {source.title}
                  {location ? ` · ${location.label}` : " · passage has changed"}
                </button>
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
  const save = (objectives: Notebook["objectives"]) =>
    change(`/notebooks/${n.id}/objectives`, "PUT", objectives);
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>What do you want to understand?</h2>
          <p>Your leerdoelen set the floor. Your curiosity sets the ceiling.</p>
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
              .map((s) => s.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
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
            <textarea
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
            <select
              aria-label="Item type"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="goal">Learning objectives / leerdoelen</option>
              <option value="concept">Concepts / begrippen</option>
            </select>
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
          <span className="kicker">Already in a document?</span>
          <p>
            Upload your objectives as a source, then let the model extract the
            list.
          </p>
          <select
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
          </select>
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
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
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
      ) : (
        <div className="objective-list">
          {n.objectives
            .filter(
              (o) =>
                filter === "all" ||
                n.coverage.find((c) => c.objectiveId === o.id)?.status ===
                  filter,
            )
            .map((o, i) => {
              const c = n.coverage.find((c) => c.objectiveId === o.id);
              return (
                <div key={o.id} className="objective">
                  <div className="objective-row">
                    <span className="objective-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <button
                      className={`bookmark ${o.important ? "marked" : ""}`}
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
                    </button>
                    <button
                      className="objective-main"
                      onClick={() =>
                        setExpanded(expanded === o.id ? null : o.id)
                      }
                    >
                      <span className="item-kind">
                        {o.kind === "goal" ? "Learning objective" : "Concept"}
                      </span>
                      <strong>{o.text}</strong>
                    </button>
                    <span className={`badge ${c?.status || "unmapped"}`}>
                      {c?.status === "covered" ? <Check size={13} /> : null}
                      {c?.status === "missing"
                        ? "Not established"
                        : c?.status || "Not mapped"}
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Expand evidence"
                      onClick={() =>
                        setExpanded(expanded === o.id ? null : o.id)
                      }
                    >
                      {expanded === o.id ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </button>
                    <button
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
                    </button>
                  </div>
                  {expanded === o.id && (
                    <div className="objective-detail">
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
                          and gaps. The model proposes coverage; exact quotes
                          are checked against your sources.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
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
              <strong>Ready to turn ideas into a conversation?</strong>
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
  run,
  change,
  refresh,
  saveSettings,
  settings,
}: WorkProps & {
  status: Capabilities | null;
  refresh: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  settings: () => void;
}) {
  const [draft, setDraft] = useState<Settings>(n.settings);
  const [eid, setEid] = useState(n.episodes[0]?.id || "");
  const [cid, setCid] = useState("");
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
  const c = e?.chapters.find((ch) => ch.id === cid) || e?.chapters[0];
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
  const totalWords =
    e?.chapters.reduce(
      (sum, ch) => sum + words(ch.turns.map((t) => t.text).join(" ")),
      0,
    ) || 0;
  const hasScript = !!e?.chapters.every((ch) => ch.turns.length);
  const fullAudio = !!e?.chapters.every((ch) => ch.audioFile);
  const qualityWarnings = e ? evaluateEpisodeQuality(e) : [];
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft({ ...draft, [key]: value });
  const ttsCost = estimateSpeech(
    totalWords ? totalWords / 145 : draft.minutes,
    e?.settings.ttsModel || draft.ttsModel,
  );
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
          <h2>Shape the conversation</h2>
        </div>
        <p className="muted">These settings apply to your next episode.</p>
        <Field label="Subject profile">
          <select
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
          </select>
        </Field>
        <div className="form-row">
          <Field label="Language">
            <select
              value={draft.language}
              disabled={disabled}
              onChange={(ev) =>
                update("language", ev.target.value as Settings["language"])
              }
            >
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
            </select>
          </Field>
          <Field label="Depth">
            <select
              value={draft.depth}
              disabled={disabled}
              onChange={(ev) =>
                update("depth", ev.target.value as Settings["depth"])
              }
            >
              <option>Foundations</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </Field>
        </div>
        <Field label="Listening purpose">
          <select
            value={draft.purpose}
            disabled={disabled}
            onChange={(ev) =>
              update("purpose", ev.target.value as Settings["purpose"])
            }
          >
            <option>Introduction</option>
            <option>Deep exploration</option>
            <option>Exam refresher</option>
          </select>
        </Field>
        <Field
          label={`Target length · ${draft.minutes} minutes`}
          hint="A target, not padding. Actual length depends on the script and delivery."
        >
          <input
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
          <textarea
            rows={3}
            value={draft.assumedKnowledge}
            disabled={disabled}
            onChange={(ev) => update("assumedKnowledge", ev.target.value)}
            placeholder="e.g. I understand parliamentary systems. Skip introductory definitions."
          />
        </Field>
        <button
          className="disclosure"
          onClick={() => setShowHarness(!showHarness)}
        >
          <Settings2 size={15} /> Edit teaching instructions{" "}
          {showHarness ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        {showHarness && (
          <Field
            label="Subject harness"
            hint="Saved with each episode so you can compare approaches."
          >
            <textarea
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
              {draft.voiceA} & {draft.voiceB}
            </span>
          </summary>
          <Field label="Speech model">
            <select
              value={draft.ttsModel}
              disabled={disabled}
              onChange={(ev) =>
                update("ttsModel", ev.target.value as Settings["ttsModel"])
              }
            >
              <option value="gemini-2.5-flash-tts">Gemini 2.5 Flash TTS</option>
              <option value="gemini-3.1-flash-tts-preview">
                Gemini 3.1 Flash TTS · preview
              </option>
              <option value="gemini-2.5-pro-tts">Gemini 2.5 Pro TTS</option>
            </select>
          </Field>
          <div className="form-row">
            {(["voiceA", "voiceB"] as const).map((key, i) => (
              <Field key={key} label={`Host ${i ? "B" : "A"}`}>
                <select
                  value={draft[key]}
                  disabled={disabled}
                  onChange={(ev) =>
                    update(key, ev.target.value as Settings["voiceA"])
                  }
                >
                  {[
                    "Kore",
                    "Charon",
                    "Puck",
                    "Aoede",
                    "Fenrir",
                    "Leda",
                    "Orus",
                    "Zephyr",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </details>
        <div className="cost-note">
          <span>Next episode · target estimate</span>
          <strong>
            {priceLabel(estimateSpeech(draft.minutes, draft.ttsModel))}{" "}
            <small>USD</small>
          </strong>
          <p>
            Before input, retries and taxes. Cloud credits are not checked by
            this app.
          </p>
        </div>
        <Button
          variant="primary wide"
          icon={Sparkles}
          disabled={
            disabled ||
            !n.sources.length ||
            !n.objectives.length ||
            draft.voiceA === draft.voiceB
          }
          onClick={() =>
            void run("Planning your episode", async () => {
              await saveSettings(draft);
              await change(`/notebooks/${n.id}/episodes`);
              setEid("");
              setCid("");
            })
          }
        >
          Plan an episode
        </Button>
        {draft.voiceA === draft.voiceB && (
          <p className="inline-error">
            Choose different voices for the two hosts.
          </p>
        )}
        <p className="fine-print">
          Uses{" "}
          {draft.provider === "codex"
            ? "your Codex login"
            : draft.provider === "opencode"
              ? "OpenCode Go"
              : "local Ollama"}{" "}
          to plan. No audio is charged yet.
        </p>
      </aside>
      <section className="studio-work">
        <div className="section-heading">
          <div>
            <span className="kicker">Your listening space</span>
            <h2>Room for the whole idea.</h2>
          </div>
          <Headphones size={26} strokeWidth={1.5} />
        </div>
        {!status?.googleProject && (
          <div className="connection-note">
            <Volume2 size={18} />
            <p>
              Connect Google Cloud to bring your episodes to life. You can plan
              and edit scripts first.
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
              <span>SB</span>
            </div>
            <h3>A conversation, shaped by you.</h3>
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
                <select
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
                </select>
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
              </p>
            </div>
            {e.error && (
              <div className="alert error">
                <CircleAlert size={18} />
                <span>{e.error}</span>
              </div>
            )}
            <div className="chapter-list">
              {e.chapters.map((ch, i) => (
                <button
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
                        ? `${words(ch.turns.map((t) => t.text).join(" ")).toLocaleString()} words`
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
                </button>
              ))}
            </div>
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
                    disabled={disabled || !status?.googleProject}
                    onClick={() => audioAction(true)}
                  >
                    Voice preview
                  </Button>
                  {!fullAudio ? (
                    <Button
                      icon={Headphones}
                      variant="audio-button"
                      disabled={disabled || !status?.googleProject}
                      onClick={() => audioAction(false)}
                    >
                      Generate audio · {priceLabel(ttsCost)}
                    </Button>
                  ) : (
                    <a
                      className="button primary"
                      href={`/api/notebooks/${n.id}/episodes/${e.id}/download?format=${status?.mp3 ? "mp3" : "wav"}`}
                    >
                      <Download size={17} /> Download{" "}
                      {status?.mp3 ? "MP3" : "WAV"}
                    </a>
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
                Estimate is based on this script. Preview generates the first
                short segment. Full generation uses paid Google Cloud speech;
                eligible credits may offset it. Completed segments are reused.
              </p>
            )}
            {e.previewFile && (
              <div className="audio-player">
                <span>Voice preview · AI-generated speech</span>
                <audio controls src={`/api/audio/${e.previewFile}`} />
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
                      <textarea
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
                          onClick={() => {
                            if (
                              confirm(
                                "Discard these unsaved transcript edits? Your saved transcript stays unchanged.",
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
                              <button
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
                              </button>
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
        <ActivityHistory notebookId={n.id} refreshKey={n.updatedAt} />
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
  const questionDraft = useDraftText(`${n.id}:question`, "", 6000);
  const { text: message, setText: setMessage } = questionDraft;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [n.messages.length]);
  return (
    <section className="chat">
      <div className="section-heading">
        <div>
          <h2>Follow a question further</h2>
          <p>
            Answers draw on this notebook’s sources, with passages you can
            inspect.
          </p>
        </div>
        <MessageSquare size={24} />
      </div>
      {!n.messages.length ? (
        <div className="chat-empty">
          <BookOpen size={40} strokeWidth={1} />
          <h3>What’s the part you want to get into?</h3>
          <p>
            Ask for a mechanism, challenge an argument, or connect two ideas.
          </p>
          <div className="suggestions">
            {[
              "Which important qualifications should I understand?",
              "Where do these sources agree or disagree?",
              "Explain the mechanism behind the central argument.",
            ].map((q) => (
              <button key={q} onClick={() => setMessage(q)}>
                {q}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages">
          {n.messages.map((m) => (
            <article key={m.id} className={`message ${m.role}`}>
              <span className="message-label">
                {m.role === "user" ? "You" : "SenniBook"}
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
                  onOpenSource={openSource}
                />
              )}
              {m.context && (
                <ContextSummary
                  summary={m.context}
                  sources={n.sources}
                  onOpenSource={openSource}
                />
              )}
            </article>
          ))}
          <div ref={end} />
        </div>
      )}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void run("Reading your sources", async () => {
            await change(`/notebooks/${n.id}/chat`, "POST", { message });
            questionDraft.accept(message);
          });
        }}
      >
        <textarea
          rows={2}
          aria-label="Question for your sources"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask something worth understanding…"
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
  onBack,
  rename,
  remove,
  refreshStatus,
  restore,
}: {
  n: Notebook | null;
  status: Capabilities | null;
  disabled: boolean;
  save: (s: Settings) => Promise<void>;
  onBack: () => void;
  rename: (title: string, description: string) => Promise<void>;
  remove: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  restore: (file: File) => Promise<void>;
}) {
  const [draft, setDraft] = useState(n?.settings);
  const [title, setTitle] = useState(n?.title || "");
  const [description, setDescription] = useState(n?.description || "");
  const bundleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setDraft(n?.settings);
  }, [n?.id]);
  return (
    <div className="settings-page">
      <Button icon={ArrowLeft} variant="quiet" onClick={onBack}>
        Back to notebook
      </Button>
      <div className="page-heading">
        <div>
          <span className="kicker">Your tools, connected</span>
          <h1>A workspace you control.</h1>
          <p>
            Local storage. Your model accounts. An editable teaching harness.
          </p>
        </div>
      </div>
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
          {draft ? (
            <>
              <Field label="Notebook provider">
                <select
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
                  <option value="opencode">
                    OpenCode Go · existing login or key
                  </option>
                  <option value="ollama">Ollama · local model</option>
                </select>
              </Field>
              <Field
                label="Model ID"
                hint={
                  draft.provider === "codex"
                    ? "Leave blank for the Codex default."
                    : draft.provider === "opencode"
                      ? status?.opencodeCli
                        ? "Leave blank for Muse Spark 1.3 Contributor, or enter a Go model ID."
                        : "Enter a Go model with a chat/completions endpoint."
                      : "Leave blank for qwen3:8b, or enter an installed Ollama model."
                }
              >
                <input
                  value={draft.model}
                  onChange={(e) =>
                    setDraft({ ...draft, model: e.target.value })
                  }
                  placeholder={
                    draft.provider === "codex"
                      ? "Codex default"
                      : draft.provider === "opencode"
                        ? "muse-spark-1.3-contributor"
                        : "qwen3:8b"
                  }
                />
              </Field>
              <Button
                variant="primary"
                icon={Check}
                disabled={disabled}
                onClick={() => void save(draft)}
              >
                Save provider
              </Button>
            </>
          ) : (
            <p>Create a notebook to choose its provider.</p>
          )}
          <details>
            <summary>Connection instructions</summary>
            <p>
              <strong>Codex:</strong> install the CLI and run{" "}
              <code>codex login</code>. SenniBook reuses that local login in a
              read-only, temporary working directory. Account limits still
              apply.
            </p>
            <p>
              <strong>OpenCode Go:</strong> install OpenCode and connect your Go
              account. SenniBook can reuse that local login. Alternatively, add{" "}
              <code>OPENCODE_API_KEY</code> to the local <code>.env</code> file
              and select a chat/completions model.
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
      <section className="settings-section" id="local-transcription">
        <div>
          <h2>Local transcription</h2>
          <p>Turn lecture recordings into sources with timestamps.</p>
        </div>
        <div className="settings-body">
          <LocalTranscriptionSetup />
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
          <h3>Notebook backups</h3>
          <p>
            A ZIP backup includes notes, saved source evidence, episode scripts
            and audio. Restore creates a new notebook and keeps your existing
            library intact.
          </p>
          <div className="actions">
            {n && (
              <a className="button" href={`/api/notebooks/${n.id}/bundle`}>
                <Download size={16} /> Back up this notebook
              </a>
            )}
            <Button
              icon={Upload}
              disabled={disabled}
              onClick={() => bundleInput.current?.click()}
            >
              Restore a notebook
            </Button>
            <input
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
            SenniBook ZIP format · up to 2 GB. Includes saved originals and
            transcripts. Older imports may only have extracted text; import
            those files again to preserve their originals.
          </p>
          {n && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void rename(title, description);
              }}
            >
              <Field label="Notebook title">
                <input
                  value={title}
                  required
                  maxLength={150}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <Field label="Notebook description">
                <textarea
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
                <Button
                  variant="quiet"
                  disabled={disabled}
                  icon={Trash2}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete “${n.title}” and its saved notes? Export your notebook first if you want to keep a copy.`,
                      )
                    )
                      void remove();
                  }}
                >
                  Delete notebook
                </Button>
              </div>
            </form>
          )}
          <h3>Readable Markdown export</h3>
          <p>
            Exports contain sources, objectives and episode transcripts. They
            open in any Markdown editor, including Obsidian if you choose to use
            it later.
          </p>
          {n && (
            <a className="button" href={`/api/notebooks/${n.id}/export`}>
              <Download size={16} /> Export this notebook
            </a>
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
    </div>
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
          "Desktop details are unavailable. Restart SenniBook to try again.",
        ),
      );
  }, []);
  return (
    <div className="desktop-details">
      <h3>SenniBook for desktop{info ? ` · ${info.version}` : ""}</h3>
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
    <App />
  </React.StrictMode>,
);
