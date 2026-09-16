import { useEffect, useMemo, useRef, useState } from "react";
import {
  FolderOpen,
  FileText,
  Plus,
  RefreshCw,
  Save,
  ExternalLink,
  ArrowRight,
  History,
  X,
  Check,
  LoaderCircle,
} from "lucide-react";
import type {
  Vault,
  VaultFile,
  VaultNote,
  VaultDraft,
} from "../../shared/vault";
import { InkButton, InkInput, InkTextarea, InkSelect } from "./InkControl";
import { confirmInk } from "./InkDialog";
import "./vault-workspace.css";

/* Operate: extend Ink with a quiet file list and a generous writing surface.
   The note remains central; selected files lead to a notebook or a reviewed draft.
   State lives beside its action. Pen traces mark controls, never animate prose. */
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
type Editor = {
  path: string;
  text: string;
  base: VaultNote | null;
  generated?: string;
};
type Recovery = { id: string; createdAt: string; reason: string };
const draftKey = (vault: string, path: string) =>
  `lmbook:vault-draft:${vault}:${path}`;

export function VaultWorkspace({
  active,
  notebooks,
  currentNotebook,
  onSourcesAdded,
  onCreateNotebook,
}: {
  active: boolean;
  notebooks: { id: string; title: string }[];
  currentNotebook: string | null;
  onSourcesAdded: (id: string) => Promise<void>;
  onCreateNotebook: () => void;
}) {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [vaultId, setVaultId] = useState("");
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [conflict, setConflict] = useState<VaultNote | null>(null);
  const [history, setHistory] = useState<Recovery[] | null>(null);
  const [historyText, setHistoryText] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<VaultDraft[]>([]);
  const [moreDrafts, setMoreDrafts] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<VaultDraft | null>(null);
  const [view, setView] = useState<"notes" | "drafts">("notes");
  const [browsing, setBrowsing] = useState(true);
  const [notebookId, setNotebookId] = useState(currentNotebook || "");
  const [prompt, setPrompt] = useState(
    "Summarize the main ideas, preserve important terms and qualifications, and point out anything these notes leave unclear.",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [draftKeys, setDraftKeys] = useState<string[]>([]);
  const latest = useRef({ vaultId, editor, busy, active });
  latest.current = { vaultId, editor, busy, active };
  const serial = useRef(0);
  const lock = useRef(false);
  const volatileDrafts = useRef(new Map<string, Editor>());
  const editorInput = useRef<HTMLTextAreaElement>(null);
  const writingSurface = useRef<HTMLDivElement>(null);
  function focusNote() {
    requestAnimationFrame(() => {
      editorInput.current?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 760px)").matches)
        writingSurface.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
    });
  }
  const vault = vaults.find((v) => v.id === vaultId);
  const dirty = !!editor && (!editor.base || editor.text !== editor.base.text);
  const filtered = useMemo(
    () =>
      files.filter((file) =>
        file.path.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
      ),
    [files, search],
  );
  const generated = reviewDraft?.id === editor?.generated ? reviewDraft : null;
  useEffect(() => {
    let cancelled = false;
    setReviewDraft(null);
    if (vaultId && editor?.generated)
      void request<VaultDraft>(`/vaults/${vaultId}/drafts/${editor.generated}`)
        .then((draft) => {
          if (!cancelled) setReviewDraft(draft);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    return () => {
      cancelled = true;
    };
  }, [vaultId, editor?.generated]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (volatileDrafts.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  function refreshDraftKeys(id: string) {
    const prefix = `lmbook:vault-draft:${id}:`;
    try {
      setDraftKeys(
        [
          ...new Set([
            ...Object.keys(localStorage),
            ...volatileDrafts.current.keys(),
          ]),
        ]
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length)),
      );
    } catch {
      setError(
        "Draft recovery storage is unavailable. Save your changes before closing LMBook.",
      );
    }
  }
  function remember(next: Editor, id = vaultId) {
    if (!next.base || next.text !== next.base.text)
      volatileDrafts.current.set(draftKey(id, next.path), next);
    else volatileDrafts.current.delete(draftKey(id, next.path));
    try {
      if (next.base && next.text === next.base.text)
        localStorage.removeItem(draftKey(id, next.path));
      else localStorage.setItem(draftKey(id, next.path), JSON.stringify(next));
      volatileDrafts.current.delete(draftKey(id, next.path));
      refreshDraftKeys(id);
    } catch {
      setError(
        "The recovery draft could not be stored. Keep this note open and save it to the vault before closing LMBook.",
      );
    }
  }
  function canLeaveEditor() {
    if (!editor || !volatileDrafts.current.has(draftKey(vaultId, editor.path)))
      return true;
    setError(
      "This draft could not be stored for recovery. Save it to the vault before opening another note or folder.",
    );
    return false;
  }
  function unusedPath(wanted: string) {
    const used = new Set([
      ...files.map((f) => f.path.toLocaleLowerCase()),
      ...draftKeys.map((p) => p.toLocaleLowerCase()),
    ]);
    let candidate = wanted,
      suffix = 2;
    while (used.has(candidate.toLocaleLowerCase()))
      candidate = wanted.replace(/\.md$/i, "") + ` ${suffix++}.md`;
    return candidate;
  }
  function edit(text: string) {
    if (!editor) return;
    const next = { ...editor, text };
    setEditor(next);
    remember(next);
    setNotice("");
  }
  async function run(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function loadFiles(id: string) {
    const result = await request<{ files: VaultFile[]; warnings: string[] }>(
      `/vaults/${id}/files`,
    );
    if (latest.current.vaultId !== id) return;
    setFiles(result.files);
    setWarnings(result.warnings);
  }
  useEffect(() => {
    let cancelled = false;
    void request<Vault[]>("/vaults")
      .then((items) => {
        if (cancelled) return;
        setVaults(items);
        setVaultId(items[0]?.id || "");
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!notebooks.some((n) => n.id === notebookId))
      setNotebookId(currentNotebook || notebooks[0]?.id || "");
  }, [notebooks, currentNotebook, notebookId]);
  useEffect(() => {
    ++serial.current;
    setFiles([]);
    setSelected(new Set());
    setEditor(null);
    setConflict(null);
    setHistory(null);
    setHistoryText(null);
    setDrafts([]);
    setSearch("");
    setWarnings([]);
    if (!vaultId) return;
    refreshDraftKeys(vaultId);
    void run("Opening vault", async () => {
      await loadFiles(vaultId);
      const result = await request<VaultDraft[]>(`/vaults/${vaultId}/drafts`);
      if (latest.current.vaultId === vaultId) {
        setDrafts(result);
        setMoreDrafts(result.length === 20);
      }
    });
  }, [vaultId]);
  useEffect(() => {
    setLimit(100);
  }, [search]);

  // Poll only the open note. A full directory scan is explicit or on window focus.
  useEffect(() => {
    if (!active || !vaultId) return;
    let pending = false,
      cancelled = false;
    async function check(scan = false) {
      if (pending || lock.current || document.hidden) return;
      pending = true;
      const current = latest.current;
      try {
        if (scan) await loadFiles(vaultId);
        if (current.editor?.base) {
          const note = await request<VaultNote>(
            `/vaults/${vaultId}/note?path=${encodeURIComponent(current.editor.path)}`,
          );
          if (
            cancelled ||
            latest.current.vaultId !== vaultId ||
            latest.current.editor?.path !== note.path ||
            lock.current
          )
            return;
          const now = latest.current.editor;
          if (note.revision !== now.base?.revision) {
            if (now.base && now.text === now.base.text) {
              setEditor({ ...now, base: note, text: note.text });
              setConflict(null);
              setNotice("Updated from the vault.");
            } else
              setConflict((previous) =>
                previous?.revision === note.revision ? previous : note,
              );
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        pending = false;
      }
    }
    const timer = setInterval(() => void check(), 4000);
    const focus = () => void check(true);
    window.addEventListener("focus", focus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [active, vaultId]);

  async function openNote(path: string) {
    if (!canLeaveEditor()) return;
    await run("Opening note", async () => {
      const requestId = ++serial.current;
      const note = await request<VaultNote>(
        `/vaults/${vaultId}/note?path=${encodeURIComponent(path)}`,
      ).catch((error) => {
        if (error.status === 404 && draftKeys.includes(path)) return null;
        throw error;
      });
      let recovered: Editor | null = null;
      try {
        recovered = JSON.parse(
          localStorage.getItem(draftKey(vaultId, path)) || "null",
        );
      } catch {}
      recovered =
        volatileDrafts.current.get(draftKey(vaultId, path)) || recovered;
      if (requestId !== serial.current) return;
      const next =
        recovered && typeof recovered.text === "string"
          ? recovered
          : note
            ? { path, text: note.text, base: note }
            : null;
      if (!next)
        throw new Error("This note is unavailable. Refresh the vault.");
      setEditor(next);
      setBrowsing(false);
      focusNote();
      setConflict(note && next.base?.revision !== note.revision ? note : null);
      setHistory(null);
      setHistoryText(null);
      if (recovered)
        setNotice(
          "Recovered your unfinished draft. Save to write it into the vault.",
        );
    });
  }
  async function connect() {
    if (!canLeaveEditor()) return;
    await run("Choosing folder", async () => {
      const chosen = await window.sennibookDesktop?.chooseVault();
      if (!chosen) return;
      setVaults(await request<Vault[]>("/vaults"));
      setVaultId(chosen.id);
    });
  }
  function newNote(draft?: VaultDraft) {
    if (!canLeaveEditor()) return;
    const path = unusedPath(
      draft
        ? `${
            draft.title
              .replace(/[\\/:*?"<>|.#\x00-\x1f]/g, " ")
              .trim()
              .slice(0, 100) || "Summary"
          }.md`
        : "Untitled.md",
    );
    const next = {
      path,
      text: draft?.markdown || "",
      base: null,
      generated: draft?.id,
    };
    setEditor(next);
    setBrowsing(false);
    setConflict(null);
    setHistory(null);
    setHistoryText(null);
    remember(next);
    focusNote();
  }
  async function save() {
    if (!editor) return;
    const submitted = editor;
    await run("Saving note", async () => {
      try {
        const note = await request<VaultNote>(
          `/vaults/${vaultId}/note`,
          "PUT",
          {
            path: submitted.path,
            text: submitted.text,
            revision: submitted.base?.revision ?? null,
          },
        );
        const next = { ...submitted, base: note, text: note.text };
        setEditor(next);
        remember(next);
        setConflict(null);
        setNotice("Saved to the vault.");
        await loadFiles(vaultId);
      } catch (e) {
        if ((e as { status?: number }).status === 409 && submitted.base) {
          const current = await request<VaultNote>(
            `/vaults/${vaultId}/note?path=${encodeURIComponent(submitted.path)}`,
          );
          setConflict(current);
        }
        throw e;
      }
    });
  }
  function changePath(path: string) {
    if (!editor) return;
    if (
      path !== editor.path &&
      draftKeys.some(
        (key) => key.toLocaleLowerCase() === path.toLocaleLowerCase(),
      )
    ) {
      setError(
        "Another unfinished draft has this filename. Choose a different name or open that draft first.",
      );
      return;
    }
    const next = { ...editor, path };
    // Store the new key before removing the old key; a storage failure must not erase it.
    try {
      localStorage.setItem(draftKey(vaultId, path), JSON.stringify(next));
      if (editor.path !== path)
        localStorage.removeItem(draftKey(vaultId, editor.path));
      volatileDrafts.current.delete(draftKey(vaultId, editor.path));
      volatileDrafts.current.delete(draftKey(vaultId, path));
      refreshDraftKeys(vaultId);
    } catch {
      volatileDrafts.current.set(draftKey(vaultId, path), next);
      setError(
        "Could not store the recovery draft. Save before closing this note.",
      );
    }
    setEditor(next);
  }
  function copyDraft() {
    if (!editor) return;
    const next = {
      ...editor,
      path: unusedPath(editor.path.replace(/\.md$/i, "") + " (copy).md"),
      base: null,
    };
    setEditor(next);
    remember(next);
    setConflict(null);
    setHistory(null);
    setHistoryText(null);
  }
  async function useSelected(summarize: boolean) {
    if (!canLeaveEditor()) return;
    if (
      [...selected].some((path) => draftKeys.includes(path)) ||
      (editor && dirty && selected.has(editor.path))
    ) {
      setError(
        "Some selected notes have unfinished drafts. Save them before using them for learning; learning tools read the version saved in your vault.",
      );
      return;
    }
    const id = vaultId;
    const book = notebookId;
    await run(summarize ? "Writing summary" : "Adding sources", async () => {
      if (summarize) {
        setGenerating(book);
        try {
          const draft = await request<VaultDraft>(
            `/vaults/${id}/summarize`,
            "POST",
            { notebookId: book, paths: [...selected], prompt },
          );
          setDrafts((previous) => [draft, ...previous]);
          setView("drafts");
          newNote(draft);
          setNotice("Summary ready. Review it before saving a new note.");
        } finally {
          setGenerating(null);
        }
      } else {
        const result = await request<{ added: number }>(
          `/vaults/${id}/sources`,
          "POST",
          { notebookId: book, paths: [...selected] },
        );
        await onSourcesAdded(book);
        setNotice(
          `${result.added} ${result.added === 1 ? "source added" : "sources added"}. Existing identical snapshots were kept.`,
        );
      }
    });
  }
  const links = useMemo(() => {
    if (!editor) return [];
    const matches = [
      ...editor.text.matchAll(/(?<!!)\[\[([^\]\n]+)\]\]/g),
    ].slice(0, 30);
    const targets = new Set(
      matches.map((m) => m[1].split("|")[0].split("#")[0]).filter(Boolean),
    );
    return [...targets].map((name) => ({
      name,
      matches: files.filter(
        (f) =>
          f.path === `${name}.md` ||
          f.path === name ||
          f.path.split("/").at(-1) === `${name}.md`,
      ),
    }));
  }, [editor?.text, files]);

  return (
    <section
      className="vault-workspace"
      hidden={!active}
      aria-label="Obsidian vaults"
    >
      <div className="page-heading vault-heading">
        <div>
          <div className="kicker">Your files, in place</div>
          <h1>Obsidian vaults</h1>
          <p>Edit your notes here. Keep using the same files in Obsidian.</p>
        </div>
        <InkButton
          className="button"
          onClick={() => void connect()}
          disabled={!!busy || !window.sennibookDesktop}
        >
          <FolderOpen size={17} /> Connect a vault
        </InkButton>
      </div>
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
      {(notice || busy) && (
        <p className="vault-status" role="status">
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <Check size={16} />
          )}
          {busy || notice}
          {generating && (
            <InkButton
              className="button quiet"
              onClick={() =>
                void request(`/notebooks/${generating}/cancel`, "POST").catch(
                  (e) => setError(e.message),
                )
              }
            >
              Stop generation
            </InkButton>
          )}
        </p>
      )}
      {!ready ? (
        <p className="vault-empty">Opening saved vault connections…</p>
      ) : !vault ? (
        <div className="vault-intro">
          <FolderOpen size={35} strokeWidth={1.4} />
          <h2>A place for the notes you already have.</h2>
          <p>
            Choose the folder you open in Obsidian. Its Markdown notes stay in
            that folder; edits and new notes from LMBook are saved there too.
          </p>
          <p>
            Select individual notes when you want to use them for learning.
            Connecting a vault does not send its contents to a model.
          </p>
          <p className="muted">
            Obsidian plugins continue to run in Obsidian. LMBook leaves your
            plugin settings and attachments untouched.
          </p>
          {!window.sennibookDesktop && (
            <p>Open the desktop app to choose a vault folder.</p>
          )}
        </div>
      ) : (
        <>
          <div className="vault-toolbar">
            <label>
              Vault
              <InkSelect
                aria-label="Connected vault"
                value={vaultId}
                disabled={!!busy}
                onChange={(e) => {
                  if (canLeaveEditor()) setVaultId(e.target.value);
                }}
              >
                {vaults.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </InkSelect>
            </label>
            <span className="vault-root" title={vault.root}>
              {vault.root}
            </span>
            <InkButton
              className="button quiet"
              disabled={!!busy}
              onClick={() =>
                void run("Refreshing vault", () => loadFiles(vaultId))
              }
            >
              <RefreshCw size={16} /> Refresh
            </InkButton>
            <InkButton
              className="button quiet"
              disabled={!!busy}
              onClick={() =>
                void run("Disconnecting vault", async () => {
                  if (!canLeaveEditor()) return;
                  if (
                    !(await confirmInk(
                      "Your files stay where they are. LMBook will keep recovery copies and generated drafts on this computer.",
                      "Disconnect this vault?",
                      "Disconnect",
                    ))
                  )
                    return;
                  await request(`/vaults/${vaultId}`, "DELETE");
                  const remaining = vaults.filter((v) => v.id !== vaultId);
                  setVaults(remaining);
                  setVaultId(remaining[0]?.id || "");
                })
              }
            >
              Disconnect
            </InkButton>
          </div>
          {warnings.map((warning) => (
            <p className="alert" key={warning}>
              {warning}
            </p>
          ))}
          <div className="vault-layout">
            <aside
              className="vault-files"
              data-collapsed={!!editor && !browsing}
              aria-label="Vault notes"
            >
              <div className="vault-list-tabs">
                <InkButton
                  className={view === "notes" ? "active" : ""}
                  aria-pressed={view === "notes"}
                  onClick={() => setView("notes")}
                >
                  Notes <small>{files.length}</small>
                </InkButton>
                <InkButton
                  className={view === "drafts" ? "active" : ""}
                  aria-pressed={view === "drafts"}
                  onClick={() => setView("drafts")}
                >
                  AI drafts <small>{drafts.length}</small>
                </InkButton>
              </div>
              {editor && (
                <InkButton
                  className="button quiet vault-browse-toggle"
                  onClick={() => setBrowsing(false)}
                >
                  Back to open note <ArrowRight size={15} />
                </InkButton>
              )}
              {view === "notes" ? (
                <>
                  <label className="vault-search">
                    Find a note
                    <InkInput
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search filenames or folders"
                    />
                  </label>
                  <div className="vault-list-actions">
                    <InkButton
                      className="button quiet"
                      disabled={!!busy}
                      onClick={() => newNote()}
                    >
                      <Plus size={16} /> New note
                    </InkButton>
                    <InkButton
                      className="button quiet"
                      disabled={!filtered.length || !!busy}
                      onClick={() =>
                        setSelected((old) => {
                          const all = filtered.every((f) => old.has(f.path));
                          const next = new Set(old);
                          filtered.forEach((f) =>
                            all ? next.delete(f.path) : next.add(f.path),
                          );
                          return next;
                        })
                      }
                    >
                      {filtered.length > 0 &&
                      filtered.every((f) => selected.has(f.path))
                        ? search
                          ? "Deselect matches"
                          : "Deselect all"
                        : search
                          ? "Select matches"
                          : "Select all"}
                    </InkButton>
                  </div>
                  <div className="vault-file-list">
                    {filtered.slice(0, limit).map((file) => (
                      <div
                        className={`vault-file-row ${editor?.path === file.path ? "current" : ""}`}
                        key={file.path}
                      >
                        <InkInput
                          type="checkbox"
                          aria-label={`Use ${file.path}`}
                          checked={selected.has(file.path)}
                          disabled={!!busy}
                          onChange={(e) =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              e.target.checked
                                ? next.add(file.path)
                                : next.delete(file.path);
                              return next;
                            })
                          }
                        />
                        <InkButton
                          disabled={!!busy}
                          aria-current={
                            editor?.path === file.path ? "page" : undefined
                          }
                          onClick={() => void openNote(file.path)}
                        >
                          <FileText size={15} />
                          <span>
                            {file.path}
                            <small>
                              {draftKeys.includes(file.path)
                                ? "Unfinished draft"
                                : file.bytes > 1048576
                                  ? "Too large to edit"
                                  : ""}
                            </small>
                          </span>
                        </InkButton>
                      </div>
                    ))}
                    {!filtered.length && (
                      <p className="vault-empty">
                        {files.length
                          ? "No filenames match your search."
                          : "No Markdown notes yet. Create the first one here."}
                      </p>
                    )}
                    {filtered.length > limit && (
                      <InkButton
                        className="button quiet"
                        onClick={() => setLimit((value) => value + 100)}
                      >
                        Show more notes
                      </InkButton>
                    )}
                    {draftKeys
                      .filter((p) => !files.some((f) => f.path === p))
                      .map((p) => (
                        <InkButton
                          className="vault-orphan"
                          disabled={!!busy}
                          key={p}
                          onClick={() =>
                            void run("Recovering draft", async () => {
                              if (!canLeaveEditor()) return;
                              const saved = JSON.parse(
                                localStorage.getItem(draftKey(vaultId, p)) ||
                                  "null",
                              );
                              if (saved) {
                                setEditor(saved);
                                setConflict(null);
                                setHistory(null);
                                setHistoryText(null);
                              }
                            })
                          }
                        >
                          <FileText size={15} />
                          <span>
                            {p || "Unnamed note"}
                            <small>Unfinished draft · not in vault</small>
                          </span>
                        </InkButton>
                      ))}
                  </div>
                </>
              ) : (
                <div className="vault-file-list">
                  {drafts.map((draft) => (
                    <InkButton
                      className="vault-draft-row"
                      disabled={!!busy}
                      key={draft.id}
                      onClick={() => newNote(draft)}
                    >
                      <span>
                        {draft.title}
                        <small>
                          {new Date(draft.createdAt).toLocaleDateString()} ·{" "}
                          {draft.sources.length} source notes
                        </small>
                      </span>
                    </InkButton>
                  ))}
                  {!drafts.length && (
                    <p className="vault-empty">
                      Select notes and draft a summary. It will stay here for
                      review before you save it into your vault.
                    </p>
                  )}
                  {moreDrafts && (
                    <InkButton
                      className="button quiet"
                      disabled={!!busy}
                      onClick={() =>
                        void run("Loading older drafts", async () => {
                          const older = await request<VaultDraft[]>(
                            `/vaults/${vaultId}/drafts?offset=${drafts.length}`,
                          );
                          setDrafts((current) => [
                            ...current,
                            ...older.filter(
                              (item) => !current.some((d) => d.id === item.id),
                            ),
                          ]);
                          setMoreDrafts(older.length === 20);
                        })
                      }
                    >
                      Load older drafts
                    </InkButton>
                  )}
                </div>
              )}
              {selected.size > 0 && (
                <InkButton
                  className="button quiet"
                  onClick={() => {
                    const section = document.getElementById("vault-learning");
                    section?.scrollIntoView({
                      block: "start",
                      behavior: "instant",
                    });
                    section?.focus({ preventScroll: true });
                  }}
                >
                  {selected.size} selected · Use notes <ArrowRight size={14} />
                </InkButton>
              )}
            </aside>
            <div className="vault-writing" ref={writingSurface}>
              {editor && (
                <InkButton
                  className="button quiet vault-browse-toggle"
                  onClick={() => setBrowsing(!browsing)}
                >
                  <FolderOpen size={16} />{" "}
                  {browsing ? "Hide note list" : "Browse notes"}
                </InkButton>
              )}
              {editor ? (
                <>
                  <div className="vault-editor-heading">
                    <div>
                      {editor.base ? (
                        <>
                          <h2>
                            {editor.path
                              .split("/")
                              .at(-1)
                              ?.replace(/\.md$/i, "")}
                          </h2>
                          <p>{editor.path}</p>
                        </>
                      ) : (
                        <label>
                          New note filename
                          <InkInput
                            value={editor.path}
                            disabled={!!busy}
                            onChange={(e) => changePath(e.target.value)}
                            placeholder="My note.md"
                          />
                          <small>
                            Use a .md filename, optionally inside an existing
                            folder.
                          </small>
                        </label>
                      )}
                      <small>
                        {dirty
                          ? "Unfinished draft · save to update the vault"
                          : "Saved in the vault"}
                      </small>
                    </div>
                    <InkButton
                      className="button primary"
                      disabled={
                        !!busy || !dirty || !!conflict || !editor.path.trim()
                      }
                      onClick={() => void save()}
                    >
                      <Save size={16} />{" "}
                      {editor.base ? "Save changes" : "Save new note"}
                    </InkButton>
                  </div>
                  {conflict && (
                    <div className="vault-conflict" role="alert">
                      <h3>This note changed in another app.</h3>
                      <p>
                        Your draft is below. Compare it with the saved version
                        before deciding which changes to keep.
                      </p>
                      <details>
                        <summary>Read the version now in the vault</summary>
                        <pre>{conflict.text}</pre>
                      </details>
                      <div className="actions">
                        <InkButton
                          className="button"
                          onClick={() => {
                            const next = { ...editor, base: conflict };
                            setEditor(next);
                            remember(next);
                            setConflict(null);
                            setNotice(
                              "External changes have not been merged. Combine any changes you want to keep in your draft, then save.",
                            );
                          }}
                        >
                          Keep editing my draft
                        </InkButton>
                        <InkButton
                          className="button"
                          onClick={() =>
                            void run("Loading saved version", async () => {
                              if (
                                !(await confirmInk(
                                  "Replace this unfinished draft with the version from the vault?",
                                  "Use the saved version?",
                                  "Use saved version",
                                ))
                              )
                                return;
                              const next = {
                                ...editor,
                                base: conflict,
                                text: conflict.text,
                              };
                              setEditor(next);
                              remember(next);
                              setConflict(null);
                            })
                          }
                        >
                          Use saved version
                        </InkButton>
                        <InkButton className="button" onClick={copyDraft}>
                          Save my draft as a copy
                        </InkButton>
                      </div>
                    </div>
                  )}
                  <InkTextarea
                    className="vault-editor"
                    ref={editorInput}
                    aria-label="Markdown note"
                    spellCheck={false}
                    value={editor.text}
                    disabled={!!busy}
                    onChange={(e) => edit(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                        e.preventDefault();
                        if (!conflict && dirty && !busy) void save();
                      }
                    }}
                  />
                  <div className="vault-editor-footer">
                    <span>
                      Markdown ·{" "}
                      {editor.text.trim()
                        ? editor.text.trim().split(/\s+/).length
                        : 0}{" "}
                      words
                    </span>
                    <div className="actions">
                      <InkButton
                        className="button quiet"
                        disabled={!!busy}
                        onClick={copyDraft}
                      >
                        Save as a copy
                      </InkButton>
                      {editor.base && (
                        <InkButton
                          className="button quiet"
                          disabled={!!busy}
                          onClick={() =>
                            void run("Loading history", async () => {
                              setHistory(
                                history
                                  ? null
                                  : await request<Recovery[]>(
                                      `/vaults/${vaultId}/history?path=${encodeURIComponent(editor.path)}`,
                                    ),
                              );
                              setHistoryText(null);
                            })
                          }
                        >
                          <History size={15} /> History
                        </InkButton>
                      )}
                      {editor.base && window.sennibookDesktop && (
                        <InkButton
                          className="button quiet"
                          disabled={!!busy}
                          onClick={() =>
                            void run("Opening Obsidian", () =>
                              window.sennibookDesktop!.openVaultInObsidian(
                                vaultId,
                                editor.path,
                              ),
                            )
                          }
                        >
                          <ExternalLink size={15} /> Open in Obsidian
                        </InkButton>
                      )}
                    </div>
                  </div>
                  {history && (
                    <div className="vault-history">
                      <h3>Recovery history</h3>
                      <p>
                        Versions saved by LMBook. Restoring one opens a draft;
                        it does not replace the file.
                      </p>
                      {history.map((item) => (
                        <InkButton
                          className="button quiet"
                          key={item.id}
                          onClick={() =>
                            void run("Reading saved version", async () => {
                              setHistoryText(
                                (
                                  await request<{ text: string }>(
                                    `/vaults/${vaultId}/history/${item.id}`,
                                  )
                                ).text,
                              );
                            })
                          }
                        >
                          {new Date(item.createdAt).toLocaleString()} ·{" "}
                          {item.reason}
                        </InkButton>
                      ))}
                      {!history.length && (
                        <p>No earlier LMBook saves for this note.</p>
                      )}
                      {historyText !== null && (
                        <>
                          <pre>{historyText}</pre>
                          <InkButton
                            className="button"
                            onClick={() => {
                              edit(historyText);
                              setHistoryText(null);
                              setHistory(null);
                            }}
                          >
                            Restore as a draft
                          </InkButton>
                        </>
                      )}
                    </div>
                  )}
                  {generated && (
                    <details className="vault-evidence">
                      <summary>
                        Review original source snapshots (
                        {generated.sources.length})
                      </summary>
                      <p>
                        These are the exact notes supplied for this draft. Later
                        vault edits do not change them.
                      </p>
                      {generated.sources.map((source) => (
                        <details key={source.path}>
                          <summary>{source.path}</summary>
                          <pre>{source.text}</pre>
                        </details>
                      ))}
                    </details>
                  )}
                  {links.length > 0 && (
                    <details className="vault-links">
                      <summary>Linked notes ({links.length})</summary>
                      {links.map((link) => (
                        <div key={link.name}>
                          <span>{link.name}</span>
                          {link.matches.length ? (
                            link.matches.map((file) => (
                              <InkButton
                                className="button quiet"
                                disabled={!!busy}
                                key={file.path}
                                onClick={() => void openNote(file.path)}
                              >
                                {file.path}
                                <ArrowRight size={14} />
                              </InkButton>
                            ))
                          ) : (
                            <small>Not found in this vault</small>
                          )}
                        </div>
                      ))}
                    </details>
                  )}
                </>
              ) : (
                <div className="vault-editor-empty">
                  <FileText size={30} strokeWidth={1.3} />
                  <h2>Open a note to start writing.</h2>
                  <p>
                    Choose a filename to edit it, or tick the notes you want to
                    use for learning.
                  </p>
                  <p className="muted">
                    Frontmatter, links and plugin markup stay in the Markdown.
                    Plugins themselves run in Obsidian.
                  </p>
                </div>
              )}
            </div>
          </div>
          <section
            className="vault-learning"
            id="vault-learning"
            tabIndex={-1}
            aria-label="Learn from selected notes"
          >
            <div className="vault-learning-heading">
              <div>
                <h2>Use your selected notes</h2>
                <p>
                  {selected.size
                    ? `${selected.size} ${selected.size === 1 ? "note selected" : "notes selected"}`
                    : "Tick notes in the list above to get started."}{" "}
                  {selected.size > 50 ? "Choose up to 50 at a time." : ""}
                </p>
              </div>
              {selected.size > 0 && (
                <InkButton
                  className="button quiet"
                  disabled={!!busy}
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </InkButton>
              )}
            </div>
            {notebooks.length ? (
              <>
                <label>
                  Learning notebook
                  <InkSelect
                    value={notebookId}
                    disabled={!!busy}
                    onChange={(e) => setNotebookId(e.target.value)}
                  >
                    {notebooks.map((book) => (
                      <option value={book.id} key={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </InkSelect>
                </label>
                <div className="vault-learning-actions">
                  <p>
                    Add copies of the saved notes as sources for questions,
                    flashcards and audio. Linked notes and attachments are not
                    included automatically.
                  </p>
                  <InkButton
                    className="button"
                    disabled={
                      !!busy ||
                      !selected.size ||
                      selected.size > 50 ||
                      !notebookId
                    }
                    onClick={() => void useSelected(false)}
                  >
                    Add as notebook sources <ArrowRight size={16} />
                  </InkButton>
                </div>
                <details className="vault-summary">
                  <summary>Write a summary into this vault</summary>
                  <label>
                    What should the summary help you understand?
                    <InkTextarea
                      rows={3}
                      maxLength={5000}
                      value={prompt}
                      disabled={!!busy}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </label>
                  <div className="vault-learning-actions">
                    <p>
                      Only selected notes are sent, using this notebook’s
                      connection and learning settings. You’ll review the draft
                      before saving a new file.
                    </p>
                    <InkButton
                      className="button primary"
                      disabled={
                        !!busy ||
                        !selected.size ||
                        selected.size > 50 ||
                        !notebookId ||
                        !prompt.trim()
                      }
                      onClick={() => void useSelected(true)}
                    >
                      Draft summary
                    </InkButton>
                  </div>
                </details>
              </>
            ) : (
              <>
                <p>
                  Create a learning notebook to choose your connection and use
                  selected notes for AI summaries, questions, flashcards or
                  audio.
                </p>
                <InkButton className="button" onClick={onCreateNotebook}>
                  <Plus size={16} /> Create a learning notebook
                </InkButton>
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
