import type { VaultNote } from "../../../shared/vault";
import type {
  VaultRecoveryDraft,
  VaultRecoveryDraftRecord,
  VaultRecoveryDraftSummary,
} from "../../../shared/vault-recovery";

/** The editor shape owned by VaultWorkspace and persisted for recovery. */
export type Editor = VaultRecoveryDraft;
export type RecoveryMetadata = VaultRecoveryDraftSummary;
export type RecoveryDetail = VaultRecoveryDraftRecord;

export type DraftStatus = "dirty" | "persisting" | "saved" | "error";

export type DraftStatusEvent = {
  vault: string;
  path: string;
  status: DraftStatus;
  pending: boolean;
  version: number | null;
  error?: string;
};

export type DraftStatusListener = (event: DraftStatusEvent) => void;

export type VaultDraftRequest = <T>(
  url: string,
  init?: RequestInit,
) => Promise<T>;

export type VaultDraftRepositoryOptions = {
  debounceMs?: number;
  request?: VaultDraftRequest;
};

type StoredDraft = {
  key: string;
  vault: string;
  path: string;
  editor: Editor;
  version: number | null;
  updatedAt: string | null;
  status: DraftStatus;
  error?: string;
  deleted: boolean;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
  putQueuedGeneration?: number;
  deleteQueuedGeneration?: number;
};

type LegacyDraft = {
  key: string;
  path: string;
  raw: string;
  editor: Editor;
};

const legacyPrefix = (vault: string) => `lmbook:vault-draft:${vault}:`;
const keyFor = (vault: string, path: string) => `${vault}\u0000${path}`;
const isClean = (editor: Editor) =>
  !!editor.base && editor.text === editor.base.text;

function cloneEditor(editor: Editor): Editor {
  return {
    path: editor.path,
    text: editor.text,
    base: editor.base ? { ...editor.base } : null,
    ...(editor.generated ? { generated: editor.generated } : {}),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Draft recovery failed.";
}

function errorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
}

async function defaultRequest<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(`/api${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-sennibook": "1",
      ...(init.headers || {}),
    },
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = Object.assign(
      new Error(
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error: unknown }).error)
          : "Draft recovery failed.",
      ),
      { status: response.status, body },
    );
    throw error;
  }
  return body as T;
}

function parseLegacyDraft(raw: string, path: string): Editor | null {
  try {
    const value = JSON.parse(raw) as Partial<Editor>;
    if (typeof value.text !== "string") return null;
    return {
      path,
      text: value.text,
      base:
        value.base && typeof value.base === "object"
          ? ({ ...value.base } as VaultNote)
          : null,
      ...(typeof value.generated === "string"
        ? { generated: value.generated }
        : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Durable recovery storage for vault note editors.
 *
 * `remember` only updates memory and starts a 350ms debounce. Writes are
 * serialized per vault/path, and all failures leave the editor in memory so
 * the workspace can keep the note open and offer an explicit Save/retry.
 */
export class VaultDraftStore {
  private readonly debounceMs: number;
  private readonly request: VaultDraftRequest;
  private readonly entries = new Map<string, StoredDraft>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<DraftStatusListener>();
  private latestError = "";
  private readonly onBlur = () => {
    void this.flush();
  };
  private readonly onPageHide = () => {
    void this.flush();
  };
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === "hidden") void this.flush();
  };

  constructor(options: VaultDraftRepositoryOptions = {}) {
    this.debounceMs = options.debounceMs ?? 350;
    this.request = options.request ?? defaultRequest;
    if (typeof window !== "undefined") {
      window.addEventListener("blur", this.onBlur);
      window.addEventListener("pagehide", this.onPageHide);
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
  }

  /** Remove lifecycle listeners. The repository can then be discarded safely. */
  dispose() {
    if (typeof window !== "undefined") {
      window.removeEventListener("blur", this.onBlur);
      window.removeEventListener("pagehide", this.onPageHide);
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    for (const entry of this.entries.values()) this.clearTimer(entry);
  }

  subscribe(listener: DraftStatusListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get hasPending() {
    return [...this.entries.values()].some(
      (entry) =>
        !!entry.timer ||
        entry.putQueuedGeneration !== undefined ||
        entry.deleteQueuedGeneration !== undefined ||
        entry.status !== "saved",
    );
  }

  get error() {
    return this.latestError;
  }

  status(vault: string, path: string) {
    return this.entries.get(keyFor(vault, path))?.status;
  }

  isPending(vault?: string, path?: string) {
    const entries = [...this.entries.values()].filter(
      (entry) =>
        (vault === undefined || entry.vault === vault) &&
        (path === undefined || entry.path === path),
    );
    return entries.some(
      (entry) =>
        !!entry.timer ||
        entry.putQueuedGeneration !== undefined ||
        entry.deleteQueuedGeneration !== undefined ||
        entry.status !== "saved",
    );
  }

  savedAt(path: string, vault?: string) {
    const entry = vault
      ? this.entries.get(keyFor(vault, path))
      : [...this.entries.values()].find((candidate) => candidate.path === path);
    return entry?.updatedAt || undefined;
  }

  /** Read the server recovery copy, retaining a pending in-memory edit. */
  async load(vault: string, path: string): Promise<Editor | null> {
    const key = keyFor(vault, path);
    const existing = this.entries.get(key);
    const loadGeneration = existing?.generation;
    if (
      existing &&
      (existing.status !== "saved" ||
        existing.deleted ||
        existing.timer ||
        existing.putQueuedGeneration !== undefined ||
        existing.deleteQueuedGeneration !== undefined)
    )
      return cloneEditor(existing.editor);

    let detail: RecoveryDetail | null;
    try {
      detail = await this.request<RecoveryDetail | null>(
        `/vaults/${encodeURIComponent(vault)}/recovery/note?path=${encodeURIComponent(path)}`,
      );
    } catch (error) {
      if (errorStatus(error) === 404) {
        const current = this.entries.get(key);
        if (current && current.generation === loadGeneration) {
          this.clearTimer(current);
          this.entries.delete(key);
          this.refreshError();
        }
        return null;
      }
      throw error;
    }

    const changed = this.entries.get(key);
    if (
      (existing && (!changed || changed.generation !== loadGeneration)) ||
      (!existing && changed && changed.generation > 0)
    )
      return changed ? cloneEditor(changed.editor) : null;

    // A successful Save can remove the recovery row while an older load is
    // still in flight. Do not leave that old editor cached for the next open.
    if (!detail) {
      if (changed) {
        this.clearTimer(changed);
        this.entries.delete(key);
        this.refreshError();
      }
      return null;
    }

    const entry =
      existing ||
      this.newEntry(vault, path, {
        path,
        text: detail.text,
        base: detail.base,
        ...(detail.generated ? { generated: detail.generated } : {}),
      });
    this.clearTimer(entry);
    entry.editor = cloneEditor({
      path,
      text: detail.text,
      base: detail.base,
      ...(detail.generated ? { generated: detail.generated } : {}),
    });
    entry.version = detail.version;
    entry.updatedAt = detail.updatedAt;
    entry.deleted = false;
    entry.status = "saved";
    entry.error = undefined;
    entry.generation += 1;
    entry.putQueuedGeneration = undefined;
    entry.deleteQueuedGeneration = undefined;
    this.emit(entry);
    return cloneEditor(entry.editor);
  }

  /**
   * List server recovery metadata. Legacy localStorage drafts are migrated
   * during this explicit recovery scan, never on each editor keystroke.
   */
  async list(vault: string): Promise<RecoveryMetadata[]> {
    const initial = await this.request<RecoveryMetadata[]>(
      `/vaults/${encodeURIComponent(vault)}/recovery`,
    );
    const migrated = await this.migrateLegacy(vault, initial);
    const metadata = migrated
      ? await this.request<RecoveryMetadata[]>(
          `/vaults/${encodeURIComponent(vault)}/recovery`,
        )
      : initial;
    return this.withUnmigratedLegacy(vault, metadata);
  }

  /** Remember the latest editor state and debounce its recovery write. */
  remember(vault: string, editor: Editor) {
    if (isClean(editor)) {
      void this.remove(vault, editor.path).catch(() => undefined);
      return;
    }

    const key = keyFor(vault, editor.path);
    const entry =
      this.entries.get(key) || this.newEntry(vault, editor.path, editor);
    this.clearTimer(entry);
    entry.editor = cloneEditor(editor);
    entry.deleted = false;
    entry.error = undefined;
    entry.status = "dirty";
    entry.generation += 1;
    this.emit(entry);

    const generation = entry.generation;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void this.enqueuePut(entry, generation).catch(() => undefined);
    }, this.debounceMs);
  }

  /**
   * Remove a recovery copy after an explicit vault Save. The tracked CAS
   * version is used unless the caller supplies a newer one.
   */
  remove(vault: string, path: string, expectedVersion?: number | null) {
    const key = keyFor(vault, path);
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve();

    this.clearTimer(entry);
    entry.deleted = true;
    entry.status = "persisting";
    entry.error = undefined;
    entry.generation += 1;
    this.emit(entry);
    const generation = entry.generation;
    return this.enqueueDelete(entry, generation, expectedVersion).catch(
      (error) => {
        throw error;
      },
    );
  }

  /** Flush timers and all currently queued writes/deletes. */
  async flush() {
    for (const entry of this.entries.values()) {
      if (entry.timer) {
        this.clearTimer(entry);
        if (entry.deleted) {
          void this.enqueueDelete(entry, entry.generation).catch(
            () => undefined,
          );
        } else {
          void this.enqueuePut(entry, entry.generation).catch(() => undefined);
        }
      } else if (
        entry.deleted &&
        entry.deleteQueuedGeneration === undefined &&
        (entry.status === "error" || entry.status === "dirty")
      ) {
        void this.enqueueDelete(entry, entry.generation).catch(() => undefined);
      } else if (
        !entry.deleted &&
        entry.putQueuedGeneration === undefined &&
        (entry.status === "dirty" || entry.status === "error")
      ) {
        void this.enqueuePut(entry, entry.generation).catch(() => undefined);
      }
    }
    await Promise.allSettled([...this.queues.values()]);
  }

  private newEntry(vault: string, path: string, editor: Editor): StoredDraft {
    const entry: StoredDraft = {
      key: keyFor(vault, path),
      vault,
      path,
      editor: cloneEditor({ ...editor, path }),
      version: null,
      updatedAt: null,
      status: "saved",
      deleted: false,
      generation: 0,
    };
    this.entries.set(entry.key, entry);
    return entry;
  }

  private clearTimer(entry: StoredDraft) {
    if (!entry.timer) return;
    clearTimeout(entry.timer);
    entry.timer = undefined;
  }

  private emit(entry: StoredDraft) {
    this.refreshError();
    const event: DraftStatusEvent = {
      vault: entry.vault,
      path: entry.path,
      status: entry.status,
      pending:
        !!entry.timer ||
        entry.putQueuedGeneration !== undefined ||
        entry.deleteQueuedGeneration !== undefined ||
        entry.status !== "saved",
      version: entry.version,
      ...(entry.error ? { error: entry.error } : {}),
    };
    this.emitEvent(event);
  }

  private emitEvent(event: DraftStatusEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private refreshError() {
    this.latestError =
      [...this.entries.values()].find((candidate) => candidate.error)?.error ||
      "";
  }

  private enqueue<T>(key: string, operation: () => Promise<T>) {
    const previous = this.queues.get(key) || Promise.resolve();
    const task = previous.catch(() => undefined).then(operation);
    this.queues.set(key, task);
    const clean = () => {
      if (this.queues.get(key) === task) this.queues.delete(key);
    };
    void task.then(clean, clean);
    return task;
  }

  private enqueuePut(entry: StoredDraft, generation: number) {
    if (entry.putQueuedGeneration === generation) return Promise.resolve(false);
    entry.putQueuedGeneration = generation;
    const snapshot = cloneEditor(entry.editor);
    const task = this.enqueue(entry.key, async () => {
      const current = this.entries.get(entry.key);
      if (!current || current.generation !== generation || current.deleted)
        return false;

      current.status = "persisting";
      current.error = undefined;
      this.emit(current);
      try {
        const detail = await this.request<RecoveryDetail>(
          `/vaults/${encodeURIComponent(current.vault)}/recovery/note`,
          {
            method: "PUT",
            body: JSON.stringify({
              editor: snapshot,
              expectedVersion: current.version,
            }),
          },
        );
        const latest = this.entries.get(entry.key);
        if (!latest) return true;
        latest.version = detail.version;
        latest.updatedAt = detail.updatedAt;
        if (latest.generation === generation) {
          latest.status = "saved";
          latest.error = undefined;
        }
        this.emit(latest);
        return true;
      } catch (error) {
        const latest = this.entries.get(entry.key);
        if (latest && latest.generation === generation) {
          latest.status = "error";
          latest.error = errorMessage(error);
          this.emit(latest);
        }
        throw error;
      }
    });
    return task.then(
      (result) => {
        if (entry.putQueuedGeneration === generation)
          entry.putQueuedGeneration = undefined;
        return result;
      },
      (error) => {
        if (entry.putQueuedGeneration === generation)
          entry.putQueuedGeneration = undefined;
        throw error;
      },
    );
  }

  private enqueueDelete(
    entry: StoredDraft,
    generation: number,
    expectedVersion?: number | null,
  ) {
    if (entry.deleteQueuedGeneration === generation)
      return Promise.resolve(false);
    entry.deleteQueuedGeneration = generation;
    const task = this.enqueue(entry.key, async () => {
      const current = this.entries.get(entry.key);
      if (!current || !current.deleted) return false;
      try {
        const version = expectedVersion ?? current.version;
        await this.request<unknown>(
          `/vaults/${encodeURIComponent(current.vault)}/recovery/note`,
          {
            method: "DELETE",
            body: JSON.stringify({
              path: current.path,
              expectedVersion: version ?? null,
            }),
          },
        );
        const latest = this.entries.get(entry.key);
        if (!latest) return true;
        latest.version = null;
        latest.updatedAt = null;
        if (latest.generation === generation && latest.deleted) {
          this.entries.delete(entry.key);
          this.refreshError();
          this.emitEvent({
            vault: latest.vault,
            path: latest.path,
            status: "saved",
            pending: false,
            version: null,
          });
        } else {
          latest.deleted = false;
          latest.status = latest.timer ? "dirty" : "saved";
          latest.error = undefined;
          this.emit(latest);
        }
        this.removeLegacy(current.vault, current.path);
        return true;
      } catch (error) {
        if (errorStatus(error) === 404) {
          const latest = this.entries.get(entry.key);
          if (latest && latest.generation === generation) {
            this.entries.delete(entry.key);
            this.refreshError();
            this.emitEvent({
              vault: latest.vault,
              path: latest.path,
              status: "saved",
              pending: false,
              version: null,
            });
            this.removeLegacy(current.vault, current.path);
          }
          return true;
        }
        const latest = this.entries.get(entry.key);
        if (latest && latest.generation === generation) {
          latest.status = "error";
          latest.error = errorMessage(error);
          this.emit(latest);
        }
        throw error;
      }
    });
    return task.then(
      (result) => {
        if (entry.deleteQueuedGeneration === generation)
          entry.deleteQueuedGeneration = undefined;
        return result;
      },
      (error) => {
        if (entry.deleteQueuedGeneration === generation)
          entry.deleteQueuedGeneration = undefined;
        throw error;
      },
    );
  }

  private readLegacy(vault: string): LegacyDraft[] {
    if (typeof window === "undefined") return [];
    const prefix = legacyPrefix(vault);
    const drafts: LegacyDraft[] = [];
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(prefix)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const path = key.slice(prefix.length);
        const editor = parseLegacyDraft(raw, path);
        if (editor) drafts.push({ key, path, raw, editor });
      }
    } catch {
      return [];
    }
    return drafts;
  }

  private async migrateLegacy(vault: string, metadata: RecoveryMetadata[]) {
    let migrated = false;
    const known = new Set(metadata.map((item) => item.path));
    for (const legacy of this.readLegacy(vault)) {
      // A server recovery copy wins over an old local copy. Keep the legacy
      // key so it is not silently discarded without a successful migration.
      if (known.has(legacy.path)) continue;
      const key = keyFor(vault, legacy.path);
      const entry =
        this.entries.get(key) ||
        this.newEntry(vault, legacy.path, legacy.editor);
      this.clearTimer(entry);
      entry.editor = cloneEditor(legacy.editor);
      if (entry.version === null) entry.updatedAt = null;
      entry.deleted = false;
      entry.status = "dirty";
      entry.error = undefined;
      entry.generation += 1;
      this.emit(entry);
      const result = await this.enqueuePut(entry, entry.generation).catch(
        () => false,
      );
      if (!result) continue;
      migrated = true;
      try {
        if (localStorage.getItem(legacy.key) === legacy.raw)
          localStorage.removeItem(legacy.key);
      } catch {
        // Keep the successful backend copy; a later recovery scan can retry
        // removing this stale compatibility key.
      }
    }
    return migrated;
  }

  private withUnmigratedLegacy(
    vault: string,
    metadata: RecoveryMetadata[],
  ): RecoveryMetadata[] {
    const result = [...metadata];
    const known = new Set(result.map((item) => item.path));
    for (const legacy of this.readLegacy(vault)) {
      if (known.has(legacy.path)) continue;
      result.push({
        path: legacy.path,
        updatedAt: new Date().toISOString(),
        bytes: new TextEncoder().encode(legacy.editor.text).byteLength,
        version: 0,
        ...(legacy.editor.generated
          ? { generated: legacy.editor.generated }
          : {}),
      });
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }

  private removeLegacy(vault: string, path: string) {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(`${legacyPrefix(vault)}${path}`);
    } catch {
      // Backend recovery is authoritative; compatibility cleanup can retry.
    }
  }
}

/** Compatibility name for callers that prefer the repository terminology. */
export { VaultDraftStore as VaultDraftRepository };
