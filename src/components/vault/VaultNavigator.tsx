import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  List,
  Plus,
  Search,
  Star,
  Tag,
} from "lucide-react";
import type { VaultFile } from "../../../shared/vault";
import { InkButton, InkInput, InkSelect } from "../InkControl";
import "./vault-navigator.css";

type NavigatorFile = VaultFile & {
  aliases?: string[];
  tags?: string[];
  title?: string;
  issue?: string;
};

type SearchResult = { path: string; snippet: string };
type NavigatorMode = "all" | "favorites" | "recent";
type SortOrder = "name" | "modified";

export type VaultNavigatorProps = {
  vaultId: string;
  activePath: string | null;
  files: NavigatorFile[];
  folders: string[];
  selectedPaths: string[];
  favoritePaths: string[];
  recentPaths: string[];
  query: string;
  onQueryChange: (query: string) => void;
  searchResults?: SearchResult[];
  indexing?: { running: boolean; completed: number; total: number };
  onOpen: (path: string) => void;
  onToggleSelected: (path: string) => void;
  onSelectPaths: (paths: string[]) => void;
  onToggleFavorite: (path: string) => void;
  onNewNote: (folder?: string) => void;
  onNewFolder: (folder?: string) => void;
  onClearSelection: () => void;
};

const PAGE_SIZE = 120;
const TREE_PAGE_SIZE = 60;

function normalizePath(value: string) {
  return value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function parentPath(value: string) {
  const parts = normalizePath(value).split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function ancestors(value: string) {
  const parts = normalizePath(value).split("/");
  const result: string[] = [];
  for (let index = 1; index < parts.length; index++)
    result.push(parts.slice(0, index).join("/"));
  return result;
}

function basename(value: string) {
  return normalizePath(value).split("/").at(-1) || value;
}

function noteName(file: NavigatorFile) {
  return basename(file.path).replace(/\.md$/i, "");
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Navigation should remain usable when persistence is unavailable.
  }
}

export function VaultNavigator({
  vaultId,
  activePath,
  files,
  folders,
  selectedPaths,
  favoritePaths,
  recentPaths,
  query,
  onQueryChange,
  searchResults,
  indexing,
  onOpen,
  onToggleSelected,
  onSelectPaths,
  onToggleFavorite,
  onNewNote,
  onNewFolder,
  onClearSelection,
}: VaultNavigatorProps) {
  const [mode, setMode] = useState<NavigatorMode>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("name");
  const [tagFilter, setTagFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rowLimit, setRowLimit] = useState(PAGE_SIZE);
  const [folderLimits, setFolderLimits] = useState<Record<string, number>>({});

  const filesByPath = useMemo(
    () => new Map(files.map((file) => [normalizePath(file.path), file])),
    [files],
  );
  const favoriteSet = useMemo(
    () => new Set(favoritePaths.map(normalizePath)),
    [favoritePaths],
  );
  const recentSet = useMemo(
    () => new Set(recentPaths.map(normalizePath)),
    [recentPaths],
  );
  const selectedSet = useMemo(
    () => new Set(selectedPaths.map(normalizePath)),
    [selectedPaths],
  );

  useEffect(() => {
    const modeKey = `lmbook:vault-navigator:${vaultId}:mode`;
    const savedMode = readJson<NavigatorMode>(modeKey, "all");
    setMode(
      ["all", "favorites", "recent"].includes(savedMode) ? savedMode : "all",
    );
    const savedFolders = readJson<string[]>(
      `lmbook:vault-navigator:${vaultId}:folders`,
      [],
    );
    setExpanded(new Set(savedFolders.map(normalizePath)));
    setTagFilter("");
    setSortOrder("name");
    setRowLimit(PAGE_SIZE);
    setFolderLimits({});
  }, [vaultId]);

  useEffect(() => {
    if (!activePath) return;
    const activeFolders = ancestors(activePath);
    if (!activeFolders.length) return;
    setExpanded((current) => {
      const next = new Set(current);
      activeFolders.forEach((folder) => next.add(folder));
      writeJson(`lmbook:vault-navigator:${vaultId}:folders`, [...next].sort());
      return next;
    });
  }, [activePath, vaultId]);

  useEffect(() => {
    setRowLimit(PAGE_SIZE);
  }, [mode, query, tagFilter, searchResults]);

  useEffect(() => {
    setFolderLimits({});
  }, [mode, query, tagFilter, searchResults]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    files.forEach((file) => file.tags?.forEach((tag) => tags.add(tag)));
    return [...tags].sort((a, b) => a.localeCompare(b));
  }, [files]);

  const localMatches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const tagNeedle = needle.startsWith("#")
      ? needle.slice(1)
      : tagFilter.toLocaleLowerCase();
    const queryNeedle = needle.startsWith("#") ? "" : needle;
    return files.filter((file) => {
      const haystack = [
        file.path,
        file.title || "",
        ...(file.aliases || []),
        ...(file.tags || []),
      ]
        .join(" ")
        .toLocaleLowerCase();
      const matchesText = !queryNeedle || haystack.includes(queryNeedle);
      const matchesTag =
        !tagNeedle ||
        (file.tags || []).some((tag) =>
          tag.toLocaleLowerCase().replace(/^#/, "").includes(tagNeedle),
        );
      return matchesText && matchesTag;
    });
  }, [files, query, tagFilter]);

  const modeMatches = useMemo(() => {
    if (mode === "favorites")
      return localMatches.filter((file) =>
        favoriteSet.has(normalizePath(file.path)),
      );
    if (mode === "recent") {
      const order = new Map(
        recentPaths.map((path, index) => [normalizePath(path), index]),
      );
      return localMatches
        .filter((file) => recentSet.has(normalizePath(file.path)))
        .sort(
          (a, b) =>
            (order.get(normalizePath(a.path)) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(normalizePath(b.path)) ?? Number.MAX_SAFE_INTEGER),
        );
    }
    return localMatches;
  }, [favoriteSet, localMatches, mode, recentPaths, recentSet]);

  const sortedMatches = useMemo(() => {
    if (mode === "recent") return modeMatches;
    return [...modeMatches].sort((a, b) => {
      if (sortOrder === "modified" && a.modified !== b.modified)
        return b.modified - a.modified;
      return normalizePath(a.path).localeCompare(normalizePath(b.path));
    });
  }, [mode, modeMatches, sortOrder]);

  const serverResults = useMemo(() => {
    const trimmedQuery = query.trim();
    if (
      !trimmedQuery ||
      trimmedQuery.startsWith("#") ||
      searchResults === undefined
    )
      return null;
    const filtered = searchResults
      .map((result) => {
        const path = normalizePath(result.path);
        return {
          ...(filesByPath.get(path) || {
            path,
            bytes: 0,
            modified: 0,
          }),
          snippet: result.snippet,
        } as NavigatorFile & { snippet: string };
      })
      .filter((file) => {
        if (
          tagFilter &&
          !(file.tags || []).some((tag) =>
            tag
              .toLocaleLowerCase()
              .replace(/^#/, "")
              .includes(tagFilter.toLocaleLowerCase().replace(/^#/, "")),
          )
        )
          return false;
        if (mode === "favorites")
          return favoriteSet.has(normalizePath(file.path));
        if (mode === "recent") return recentSet.has(normalizePath(file.path));
        return true;
      });
    if (mode === "recent") {
      const order = new Map(
        recentPaths.map((path, index) => [normalizePath(path), index]),
      );
      return filtered.sort(
        (a, b) =>
          (order.get(normalizePath(a.path)) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(normalizePath(b.path)) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return filtered.sort((a, b) => {
      if (sortOrder === "modified" && a.modified !== b.modified)
        return b.modified - a.modified;
      return normalizePath(a.path).localeCompare(normalizePath(b.path));
    });
  }, [
    favoriteSet,
    filesByPath,
    mode,
    query,
    recentPaths,
    recentSet,
    searchResults,
    sortOrder,
    tagFilter,
  ]);

  const candidates = serverResults || sortedMatches;
  const visibleFiles = candidates.slice(0, rowLimit);
  const hiddenCount = Math.max(0, candidates.length - visibleFiles.length);

  const folderSet = useMemo(() => {
    const result = new Set<string>();
    folders.forEach((folder) => {
      const clean = normalizePath(folder);
      if (!clean) return;
      result.add(clean);
      ancestors(clean).forEach((ancestor) => result.add(ancestor));
    });
    files.forEach((file) => {
      const parent = parentPath(file.path);
      if (!parent) return;
      result.add(parent);
      ancestors(parent).forEach((ancestor) => result.add(ancestor));
    });
    return result;
  }, [files, folders]);

  const treeFilesByFolder = useMemo(() => {
    const map = new Map<string, (NavigatorFile & { snippet?: string })[]>();
    files.forEach((file) => {
      const folder = parentPath(file.path);
      const current = map.get(folder) || [];
      current.push(file);
      map.set(folder, current);
    });
    map.forEach((folderFiles) =>
      folderFiles.sort((a, b) => {
        if (sortOrder === "modified" && a.modified !== b.modified)
          return b.modified - a.modified;
        return normalizePath(a.path).localeCompare(normalizePath(b.path));
      }),
    );
    return map;
  }, [files, sortOrder]);

  const foldersByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    [...folderSet].forEach((folder) => {
      const parent = parentPath(folder);
      const current = map.get(parent) || [];
      current.push(folder);
      map.set(parent, current);
    });
    map.forEach((children) => children.sort((a, b) => a.localeCompare(b)));
    return map;
  }, [folderSet]);

  const rootFiles = treeFilesByFolder.get("") || [];
  const rootFolders = foldersByParent.get("") || [];
  const rootLimit = folderLimits[""] || TREE_PAGE_SIZE;
  const visibleRootFiles = rootFiles.slice(0, rootLimit);
  const visibleRootFolders = rootFolders.slice(0, rootLimit);
  const hiddenRootFiles = Math.max(
    0,
    rootFiles.length - visibleRootFiles.length,
  );
  const hiddenRootFolders = Math.max(
    0,
    rootFolders.length - visibleRootFolders.length,
  );

  const visibleTreePaths = useMemo(() => {
    function collectFolderPaths(folder: string): string[] {
      if (!expanded.has(folder)) return [];
      const limit = folderLimits[folder] || TREE_PAGE_SIZE;
      const paths = (treeFilesByFolder.get(folder) || [])
        .slice(0, limit)
        .map((file) => normalizePath(file.path));
      (foldersByParent.get(folder) || [])
        .slice(0, limit)
        .forEach((child) => paths.push(...collectFolderPaths(child)));
      return paths;
    }

    const paths = visibleRootFiles.map((file) => normalizePath(file.path));
    visibleRootFolders.forEach((folder) =>
      paths.push(...collectFolderPaths(folder)),
    );
    return paths;
  }, [
    expanded,
    folderLimits,
    foldersByParent,
    treeFilesByFolder,
    visibleRootFiles,
    visibleRootFolders,
  ]);

  const isFlatMode =
    !!serverResults || mode !== "all" || !!query.trim() || !!tagFilter;
  const visiblePaths = isFlatMode
    ? visibleFiles.map((file) => normalizePath(file.path))
    : visibleTreePaths;

  useEffect(() => {
    if (!activePath) return;
    const folder = parentPath(activePath);
    const index = (treeFilesByFolder.get(folder) || []).findIndex(
      (file) => normalizePath(file.path) === normalizePath(activePath),
    );
    if (index < 0) return;
    const needed = Math.ceil((index + 1) / TREE_PAGE_SIZE) * TREE_PAGE_SIZE;
    setFolderLimits((current) => {
      if ((current[folder] || TREE_PAGE_SIZE) >= needed) return current;
      return { ...current, [folder]: needed };
    });
  }, [activePath, treeFilesByFolder]);

  function toggleFolder(folder: string, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(folder);
      else next.delete(folder);
      writeJson(`lmbook:vault-navigator:${vaultId}:folders`, [...next].sort());
      return next;
    });
  }

  function setNavigatorMode(next: NavigatorMode) {
    setMode(next);
    writeJson(`lmbook:vault-navigator:${vaultId}:mode`, next);
  }

  function showMoreInFolder(folder: string) {
    setFolderLimits((current) => ({
      ...current,
      [folder]: (current[folder] || TREE_PAGE_SIZE) + TREE_PAGE_SIZE,
    }));
  }

  function renderFile(file: NavigatorFile & { snippet?: string }) {
    const path = normalizePath(file.path);
    const selected = selectedSet.has(path);
    const favorite = favoriteSet.has(path);
    const aliases = file.aliases?.filter(Boolean).slice(0, 2) || [];
    return (
      <div className="vault-navigator-file" key={path}>
        <InkInput
          type="checkbox"
          aria-label={`Select ${path}`}
          checked={selected}
          onChange={() => onToggleSelected(path)}
        />
        <InkButton
          type="button"
          className={`source-open vault-navigator-file-open ${activePath === path ? "is-active" : ""}`}
          aria-current={activePath === path ? "page" : undefined}
          onClick={() => onOpen(path)}
          title={path}
        >
          <FileText size={15} aria-hidden="true" />
          <span className="vault-navigator-file-copy">
            <span className="vault-navigator-file-title">{noteName(file)}</span>
            <small className="vault-navigator-file-path">{path}</small>
            {file.snippet && (
              <small className="vault-navigator-snippet">{file.snippet}</small>
            )}
            {aliases.length > 0 && (
              <small className="vault-navigator-meta">
                Also known as {aliases.join(", ")}
              </small>
            )}
            {file.issue && (
              <small className="vault-navigator-issue">{file.issue}</small>
            )}
          </span>
        </InkButton>
        <InkButton
          type="button"
          className={`source-open vault-navigator-favorite ${favorite ? "is-favorite" : ""}`}
          title={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-label={
            favorite ? `Remove ${path} from favorites` : `Favorite ${path}`
          }
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(path)}
        >
          <Star
            size={14}
            fill={favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </InkButton>
      </div>
    );
  }

  function renderFolder(folder: string): React.ReactNode {
    const children = foldersByParent.get(folder) || [];
    const folderFiles = treeFilesByFolder.get(folder) || [];
    const limit = folderLimits[folder] || TREE_PAGE_SIZE;
    const visibleFolderFiles = folderFiles.slice(0, limit);
    const visibleChildren = children.slice(0, limit);
    const hiddenFiles = Math.max(
      0,
      folderFiles.length - visibleFolderFiles.length,
    );
    const hiddenChildren = Math.max(
      0,
      children.length - visibleChildren.length,
    );
    const isOpen = expanded.has(folder);
    const noteCount = folderFiles.length;
    const name = basename(folder);
    return (
      <details
        className="vault-navigator-folder"
        open={expanded.has(folder)}
        onToggle={(event) =>
          toggleFolder(folder, (event.currentTarget as HTMLDetailsElement).open)
        }
        key={folder}
      >
        <summary>
          {expanded.has(folder) ? (
            <FolderOpen size={15} aria-hidden="true" />
          ) : (
            <Folder size={15} aria-hidden="true" />
          )}
          <span>{name}</span>
          {noteCount > 0 && <small>{noteCount}</small>}
        </summary>
        {isOpen && (
          <div className="vault-navigator-folder-body">
            <div className="vault-navigator-folder-actions">
              <InkButton type="button" onClick={() => onNewNote(folder)}>
                <Plus size={13} aria-hidden="true" /> New note here
              </InkButton>
              <InkButton type="button" onClick={() => onNewFolder(folder)}>
                <FolderPlus size={13} aria-hidden="true" /> New folder
              </InkButton>
            </div>
            {visibleChildren.map((child) => renderFolder(child))}
            {visibleFolderFiles.map(renderFile)}
            {!children.length && !folderFiles.length && !indexing?.running && (
              <p className="vault-navigator-folder-empty">
                This folder is empty.
              </p>
            )}
            {hiddenChildren > 0 && (
              <InkButton
                type="button"
                className="vault-navigator-show-more"
                onClick={() => showMoreInFolder(folder)}
              >
                Show more folders · {hiddenChildren.toLocaleString()} remaining
              </InkButton>
            )}
            {hiddenFiles > 0 && (
              <InkButton
                type="button"
                className="vault-navigator-show-more"
                onClick={() => showMoreInFolder(folder)}
              >
                Show more notes · {hiddenFiles.toLocaleString()} remaining
              </InkButton>
            )}
          </div>
        )}
      </details>
    );
  }

  const emptyMessage =
    mode === "favorites"
      ? "Star a note to keep it close."
      : mode === "recent"
        ? "Notes you open will appear here."
        : query.trim()
          ? "No notes match this search."
          : "No Markdown notes in this vault yet.";

  return (
    <nav className="vault-navigator" aria-label="Vault navigator">
      <div className="vault-navigator-heading">
        <div>
          <span className="vault-navigator-kicker">Navigate</span>
          <h2>Notes</h2>
        </div>
        <div className="vault-navigator-heading-actions">
          <InkButton
            type="button"
            className="vault-navigator-icon-action"
            aria-label="New note in vault root"
            title="New note"
            onClick={() => onNewNote()}
          >
            <Plus size={16} aria-hidden="true" />
          </InkButton>
          <InkButton
            type="button"
            className="vault-navigator-icon-action"
            aria-label="New folder in vault root"
            title="New folder"
            onClick={() => onNewFolder()}
          >
            <FolderPlus size={16} aria-hidden="true" />
          </InkButton>
        </div>
      </div>

      <div className="vault-navigator-modes" aria-label="Note views">
        <InkButton
          type="button"
          className={mode === "all" ? "is-active" : ""}
          aria-pressed={mode === "all"}
          onClick={() => setNavigatorMode("all")}
        >
          <List size={14} aria-hidden="true" /> All notes
        </InkButton>
        <InkButton
          type="button"
          className={mode === "favorites" ? "is-active" : ""}
          aria-pressed={mode === "favorites"}
          onClick={() => setNavigatorMode("favorites")}
        >
          <Star size={14} aria-hidden="true" /> Favorites
        </InkButton>
        <InkButton
          type="button"
          className={mode === "recent" ? "is-active" : ""}
          aria-pressed={mode === "recent"}
          onClick={() => setNavigatorMode("recent")}
        >
          <Clock3 size={14} aria-hidden="true" /> Recent
        </InkButton>
      </div>

      <label className="vault-navigator-search-label">
        <span>Find a note</span>
        <span className="vault-navigator-search-field">
          <Search size={15} aria-hidden="true" />
          <InkInput
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, alias, tag, or content"
            aria-label="Search vault notes"
          />
        </span>
      </label>

      <div className="vault-navigator-filters">
        {allTags.length > 0 && (
          <label className="vault-navigator-filter vault-navigator-tag-filter">
            <Tag size={13} aria-hidden="true" />
            <InkSelect
              aria-label="Filter notes by tag"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="">All tags</option>
              {allTags.slice(0, 80).map((tag) => (
                <option value={tag} key={tag}>
                  {tag}
                </option>
              ))}
            </InkSelect>
          </label>
        )}
        <label className="vault-navigator-filter vault-navigator-sort-filter">
          <span className="vault-navigator-filter-caption">Sort</span>
          <InkSelect
            aria-label="Sort notes"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
          >
            <option value="name">Name</option>
            <option value="modified">Recently changed</option>
          </InkSelect>
        </label>
      </div>

      {indexing?.running && (
        <p className="vault-navigator-indexing" role="status">
          Indexing content {indexing.completed.toLocaleString()} of{" "}
          {indexing.total.toLocaleString()}…
        </p>
      )}

      <div className="vault-navigator-list" aria-label="Vault notes">
        {isFlatMode && visibleFiles.length === 0 ? (
          <p className="vault-navigator-empty">{emptyMessage}</p>
        ) : isFlatMode ? (
          <div className="vault-navigator-flat-list">
            {visibleFiles.map(renderFile)}
          </div>
        ) : (
          <>
            {visibleRootFiles.map(renderFile)}
            {visibleRootFolders.map((folder) => renderFolder(folder))}
            {!rootFiles.length && !rootFolders.length && !indexing?.running && (
              <p className="vault-navigator-empty">{emptyMessage}</p>
            )}
            {hiddenRootFiles > 0 && (
              <InkButton
                type="button"
                className="vault-navigator-show-more"
                onClick={() => showMoreInFolder("")}
              >
                Show more notes · {hiddenRootFiles.toLocaleString()} remaining
              </InkButton>
            )}
            {hiddenRootFolders > 0 && (
              <InkButton
                type="button"
                className="vault-navigator-show-more"
                onClick={() => showMoreInFolder("")}
              >
                Show more folders · {hiddenRootFolders.toLocaleString()}{" "}
                remaining
              </InkButton>
            )}
          </>
        )}
        {isFlatMode && hiddenCount > 0 && (
          <InkButton
            type="button"
            className="vault-navigator-show-more"
            onClick={() => setRowLimit((current) => current + PAGE_SIZE)}
          >
            Show more · {hiddenCount.toLocaleString()} remaining
          </InkButton>
        )}
      </div>

      <div className="vault-navigator-selection" aria-live="polite">
        <div>
          <strong>{selectedPaths.length} selected</strong>
          {selectedPaths.length > 0 &&
            visiblePaths.length < selectedPaths.length && (
              <small>{visiblePaths.length} visible in this view</small>
            )}
          {visiblePaths.length > 150 && (
            <small>Selection is limited to 150 notes.</small>
          )}
        </div>
        <div className="vault-navigator-selection-actions">
          <InkButton
            type="button"
            disabled={!visiblePaths.length}
            onClick={() => onSelectPaths(visiblePaths)}
          >
            Select visible
          </InkButton>
          <InkButton
            type="button"
            disabled={!selectedPaths.length}
            onClick={onClearSelection}
          >
            Clear
          </InkButton>
        </div>
      </div>
    </nav>
  );
}
