import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Clock3, FileText, Plus, Search, X } from "lucide-react";
import type { VaultFile } from "../../../shared/vault";
import type {
  VaultSemanticPreference,
  VaultSemanticSearchResult,
  VaultSemanticStatus,
} from "../../../shared/vault-semantic";
import { InkButton, InkInput, InkSelect } from "../InkControl";
import "./vault-quick-switcher.css";

type QuickFile = VaultFile & {
  title?: string;
  aliases?: string[];
};

export type VaultQuickSwitcherProps = {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  files: QuickFile[];
  recentPaths: string[];
  onOpenNote: (path: string) => void;
  onCreateNote: (name: string) => void;
  /** Supplied by the vault workspace when semantic search is configured. */
  semanticSearch?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{
    results: VaultSemanticSearchResult[];
    status: VaultSemanticStatus;
    rankingNotice?: string;
  }>;
  semanticStatus?: VaultSemanticStatus | null;
  onBuildSemanticIndex?: (allowCloud: boolean) => void;
  onCancelSemanticIndex?: () => void;
  semanticMode?: VaultSemanticPreference;
  onSemanticModeChange?: (mode: VaultSemanticPreference) => void;
  semanticError?: string | null;
  semanticPending?: boolean;
};

type RankedFile = QuickFile & { score: number; recent: boolean };

const MAX_RESULTS = 50;

function normalizePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function basename(value: string) {
  return normalizePath(value).split("/").at(-1) || value;
}

function noteName(file: QuickFile) {
  return basename(file.path).replace(/\.md$/i, "");
}

function compact(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[\s_./\\-]+/g, "");
}

function subsequenceScore(value: string, query: string) {
  const normalizedValue = compact(value);
  const normalizedQuery = compact(query);
  let cursor = 0;
  let score = 0;
  let previous = -2;
  for (const character of normalizedQuery) {
    const index = normalizedValue.indexOf(character, cursor);
    if (index < 0) return -1;
    score += index === previous + 1 ? 12 : 5;
    if (index === 0) score += 5;
    previous = index;
    cursor = index + 1;
  }
  return score;
}

function rankFile(file: QuickFile, query: string, recentRank: number) {
  if (!query.trim()) return Math.max(0, 1000 - recentRank);
  const needle = compact(query);
  const path = normalizePath(file.path).toLocaleLowerCase();
  const name = noteName(file);
  const title = file.title?.trim() || "";
  const aliases = (file.aliases || []).map((alias) =>
    alias.toLocaleLowerCase(),
  );
  const fields = [name, title, path, ...aliases];
  let score = Math.max(
    ...fields.map((field) => subsequenceScore(field, query)),
  );
  if (score < 0) return -1;
  if (compact(name) === needle) score += 160;
  if (compact(name).startsWith(needle)) score += 90;
  if (compact(path).startsWith(needle)) score += 35;
  if (aliases.some((alias) => compact(alias).startsWith(needle))) score += 65;
  if (path.includes(query.toLocaleLowerCase())) score += 25;
  return score;
}

function createNameFromQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return "";
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function safeCreateName(name: string) {
  return (
    !!name &&
    name.length <= 500 &&
    !/[\\/:*?"<>|\u0000-\u001f]/.test(name) &&
    !/^\.+$/.test(name)
  );
}

export function VaultQuickSwitcher({
  open,
  onClose,
  vaultId,
  files,
  recentPaths,
  onOpenNote,
  onCreateNote,
  semanticSearch,
  semanticStatus,
  onBuildSemanticIndex,
  onCancelSemanticIndex,
  semanticMode,
  semanticPending,
  onSemanticModeChange,
  semanticError,
}: VaultQuickSwitcherProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [semanticResults, setSemanticResults] = useState<
    VaultSemanticSearchResult[]
  >([]);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [rankingNotice, setRankingNotice] = useState<string | null>(null);
  const [allowCloud, setAllowCloud] = useState(false);
  const semanticAbort = useRef<AbortController | null>(null);
  const titleId = useId();
  const listId = useId();

  const recentRanks = useMemo(
    () =>
      new Map(recentPaths.map((path, index) => [normalizePath(path), index])),
    [recentPaths],
  );

  const results = useMemo<RankedFile[]>(() => {
    const seen = new Set<string>();
    return files
      .map((file) => {
        const path = normalizePath(file.path);
        const recentRank = recentRanks.get(path);
        return {
          ...file,
          path,
          score: rankFile(file, query, recentRank ?? recentPaths.length + 1),
          recent: recentRank !== undefined,
        };
      })
      .filter((file) => {
        if (seen.has(file.path)) return false;
        seen.add(file.path);
        return file.score >= 0;
      })
      .sort((a, b) => {
        if (!query.trim() && a.recent !== b.recent) return a.recent ? -1 : 1;
        if (a.score !== b.score) return b.score - a.score;
        return a.path.localeCompare(b.path);
      })
      .slice(0, MAX_RESULTS);
  }, [files, query, recentPaths.length, recentRanks]);

  const createName = createNameFromQuery(query);
  const canCreate = safeCreateName(createName);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !wasOpen.current) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setQuery("");
      setActiveIndex(0);
      if (!element.open) element.showModal();
      requestAnimationFrame(() =>
        input.current?.focus({ preventScroll: true }),
      );
    } else if (!open && wasOpen.current) {
      if (element.open) element.close();
      if (previousFocus.current?.isConnected)
        previousFocus.current.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(
    () => () => {
      if (dialog.current?.open) dialog.current.close();
      if (previousFocus.current?.isConnected)
        previousFocus.current.focus({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    if (!results.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((current) => Math.min(current, results.length - 1));
  }, [results.length]);

  function runSemanticSearch() {
    semanticAbort.current?.abort();
    setSemanticResults([]);
    setRankingNotice(null);
    if (
      !semanticSearch ||
      semanticMode === "lexical" ||
      query.trim().length < 3
    )
      return;
    const controller = new AbortController();
    semanticAbort.current = controller;
    setSemanticBusy(true);
    void semanticSearch(query.trim(), controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) {
          setSemanticResults(response.results);
          setRankingNotice(response.rankingNotice || null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setSemanticBusy(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSemanticBusy(false);
      });
  }

  useEffect(() => {
    semanticAbort.current?.abort();
    setSemanticResults([]);
    setRankingNotice(null);
    setSemanticBusy(false);
    return () => semanticAbort.current?.abort();
  }, [query, open, vaultId, semanticMode]);

  function dismiss() {
    onClose();
  }

  function openResult(index = activeIndex) {
    const result = results[index];
    if (!result) return;
    dismiss();
    onOpenNote(result.path);
  }

  function createNote() {
    if (!canCreate) return;
    dismiss();
    onCreateNote(createName);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length ? (current + 1) % results.length : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      );
    } else if (event.key === "Home" && results.length) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && results.length) {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) createNote();
      else openResult();
    } else if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    }
  }

  return (
    <dialog
      ref={dialog}
      className="ink-dialog vault-quick-switcher"
      data-vault-id={vaultId}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <div className="vault-quick-switcher-heading">
        <div>
          <span className="vault-quick-switcher-kicker">Vault notes</span>
          <h2 id={titleId}>Open a note</h2>
        </div>
        <InkButton
          type="button"
          className="icon-button"
          aria-label="Close quick switcher"
          onClick={dismiss}
        >
          <X size={17} aria-hidden="true" />
        </InkButton>
      </div>
      <label className="vault-quick-switcher-search">
        <span className="vault-quick-switcher-search-icon">
          <Search size={16} aria-hidden="true" />
        </span>
        <InkInput
          ref={input}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search names, aliases, or paths"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            results[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          aria-label="Search vault notes"
        />
      </label>
      <div className="vault-quick-switcher-hint">
        <span>↑↓ navigate</span>
        <span>Enter open</span>
        <span>Shift+Enter create</span>
      </div>
      {semanticSearch && (
        <div className="vault-quick-switcher-semantic">
          <div>
            <strong>Meaning search</strong>
            <small>
              {semanticStatus?.running
                ? semanticStatus.total
                  ? `Indexing ${semanticStatus.completed}/${semanticStatus.total}`
                  : "Scanning notes…"
                : semanticStatus?.updatedAt
                  ? `${semanticStatus.identity?.kind === "cloud" ? "OpenRouter" : "Local E5"} · updated ${new Date(semanticStatus.updatedAt).toLocaleDateString()}`
                  : "Build an index to search note text by meaning."}
            </small>
          </div>
          {onSemanticModeChange && (
            <label>
              Mode{" "}
              <InkSelect
                disabled={semanticPending}
                value={semanticMode || "lexical"}
                onChange={(event) =>
                  onSemanticModeChange(
                    event.target.value as VaultSemanticPreference,
                  )
                }
              >
                <option value="lexical">Names & aliases</option>
                <option value="local">Local E5</option>
                <option value="openrouter">OpenRouter (cloud)</option>
              </InkSelect>
            </label>
          )}
          {semanticStatus?.running
            ? onCancelSemanticIndex && (
                <InkButton
                  type="button"
                  className="button quiet"
                  disabled={semanticPending}
                  onClick={onCancelSemanticIndex}
                >
                  Cancel
                </InkButton>
              )
            : onBuildSemanticIndex && (
                <InkButton
                  type="button"
                  className="button quiet"
                  onClick={() => onBuildSemanticIndex(allowCloud)}
                  disabled={
                    semanticPending ||
                    semanticMode === "lexical" ||
                    (semanticMode === "openrouter" && !allowCloud)
                  }
                >
                  {semanticStatus?.updatedAt ? "Refresh index" : "Build index"}
                </InkButton>
              )}
          {onBuildSemanticIndex && semanticMode === "openrouter" && (
            <label className="vault-cloud-consent">
              <input
                type="checkbox"
                checked={allowCloud}
                onChange={(event) => setAllowCloud(event.target.checked)}
              />{" "}
              Send this vault’s note text to OpenRouter to build the index.
              Searches also send your query; API credits apply.
            </label>
          )}
          <InkButton
            type="button"
            className="button primary"
            disabled={
              query.trim().length < 3 ||
              semanticBusy ||
              semanticPending ||
              semanticMode === "lexical" ||
              !semanticStatus?.updatedAt
            }
            onClick={runSemanticSearch}
          >
            Search note text
          </InkButton>
          {semanticError && <small role="status">{semanticError}</small>}
        </div>
      )}
      <div
        id={listId}
        className="vault-quick-switcher-results"
        role="listbox"
        aria-label="Matching vault notes"
      >
        {results.length ? (
          results.map((file, index) => (
            <InkButton
              type="button"
              role="option"
              id={`${listId}-${index}`}
              aria-selected={activeIndex === index}
              className={`vault-quick-switcher-option ${activeIndex === index ? "is-active" : ""}`}
              key={file.path}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openResult(index)}
            >
              <FileText size={16} aria-hidden="true" />
              <span className="vault-quick-switcher-option-copy">
                <span className="vault-quick-switcher-option-name">
                  {noteName(file)}
                  {file.recent && (
                    <Clock3 size={12} aria-label="Recently opened" />
                  )}
                </span>
                <small>{file.path}</small>
              </span>
            </InkButton>
          ))
        ) : semanticResults.length ? null : (
          <p className="vault-quick-switcher-empty">
            {query.trim()
              ? "No matching note names."
              : "No notes in this vault yet."}
          </p>
        )}
        {rankingNotice && (
          <p className="vault-quick-switcher-scope" role="status">
            {rankingNotice}
          </p>
        )}
        {semanticResults.length > 0 && (
          <div className="vault-quick-switcher-semantic-results">
            <span className="vault-quick-switcher-kicker">Meaning matches</span>
            {semanticResults.slice(0, 8).map((match) => (
              <InkButton
                type="button"
                className="vault-quick-switcher-option"
                key={`${match.path}:${match.start}`}
                onClick={() => {
                  dismiss();
                  onOpenNote(match.path);
                }}
              >
                <Search size={15} aria-hidden="true" />
                <span className="vault-quick-switcher-option-copy">
                  <span className="vault-quick-switcher-option-name">
                    {match.title && match.title !== match.path
                      ? match.title
                      : basename(match.path).replace(/\.md$/i, "")}
                  </span>
                  <small>{match.path}</small>
                  <span className="vault-meaning-excerpt">
                    {match.text.slice(0, 220)}
                    {match.text.length > 220 ? "…" : ""}
                  </span>
                </span>
              </InkButton>
            ))}
          </div>
        )}
        {semanticBusy && (
          <p className="vault-quick-switcher-scope">Searching note text…</p>
        )}
      </div>
      {canCreate && (
        <div className="vault-quick-switcher-create">
          <InkButton type="button" onClick={createNote}>
            <Plus size={15} aria-hidden="true" /> Create “{createName}”
          </InkButton>
        </div>
      )}
      <p className="vault-quick-switcher-scope">
        Searching names, aliases, and paths in this vault.
      </p>
    </dialog>
  );
}
