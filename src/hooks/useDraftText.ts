import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

const STORAGE_PREFIX = "sennibook:draft:v1:";
const WRITE_DELAY_MS = 350;
const STORAGE_CONFLICT_WARNING =
  "Another tab saved a different draft. Copy any text you want to keep before leaving, then reopen this view to load the saved draft.";

type StoredDraft = {
  version: 1;
  text: string;
};

type DraftSession = {
  key: string;
  initialText: string;
  maxChars: number;
  text: string;
  restored: boolean;
  storageError?: string;
  observedRaw?: string | null;
};

type PendingDraft = {
  key: string;
  initialText: string;
  maxChars: number;
  text: string;
  observedRaw?: string | null;
};

type ActiveDraftOwner = {
  text: string;
  observedRaw?: string | null;
  replace: (
    expectedText: string,
    replacementText: string,
    observedRaw?: string | null,
  ) => boolean;
};

// This registry contains only mounted hook instances. It lets a completion
// callback from an unmounted component notice an edit made by a replacement
// component before that edit reaches localStorage, without retaining a global
// history of drafts.
const activeDrafts = new Map<string, Map<symbol, ActiveDraftOwner>>();

function registerActiveDraft(
  key: string,
  owner: symbol,
  text: string,
  observedRaw: string | null | undefined,
  replace: ActiveDraftOwner["replace"],
): void {
  const owners = activeDrafts.get(key) || new Map<symbol, ActiveDraftOwner>();
  owners.set(owner, { text, observedRaw, replace });
  activeDrafts.set(key, owners);
}

function updateActiveDraft(
  key: string,
  owner: symbol,
  text: string,
  observedRaw?: string | null,
): void {
  const owners = activeDrafts.get(key);
  const active = owners?.get(owner);
  if (active) {
    active.text = text;
    active.observedRaw = observedRaw;
  }
}

function unregisterActiveDraft(key: string, owner: symbol): void {
  const owners = activeDrafts.get(key);
  if (!owners) return;
  owners.delete(owner);
  if (!owners.size) activeDrafts.delete(key);
}

function anotherActiveDraftDiffers(key: string, expectedText: string): boolean {
  const owners = activeDrafts.get(key);
  return owners
    ? Array.from(owners.values()).some(({ text }) => text !== expectedText)
    : false;
}

function activeObservedRawMatches(key: string, raw: string | null): boolean {
  const owners = activeDrafts.get(key);
  return owners
    ? Array.from(owners.values()).some((owner) => owner.observedRaw === raw)
    : false;
}

function replaceActiveDrafts(
  key: string,
  expectedText: string,
  replacementText: string,
  observedRaw?: string | null,
): boolean {
  const owners = activeDrafts.get(key);
  if (!owners) return false;
  let replaced = false;
  for (const owner of owners.values()) {
    if (owner.text === expectedText) {
      replaced =
        owner.replace(expectedText, replacementText, observedRaw) || replaced;
    }
  }
  return replaced;
}

export type DraftTextState = {
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  discard: () => void;
  accept: (expectedText: string, replacementText?: string) => boolean;
  clearIfUnchanged: (expectedText: string, replacementText?: string) => boolean;
  storageError: string | undefined;
  restored: boolean;
};

function limitFor(maxChars: number): number {
  return Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 0;
}

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function localStorageOrUndefined(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function initialSession(
  key: string,
  initialText: string,
  maxChars: number,
): DraftSession {
  const storage = localStorageOrUndefined();
  const base: DraftSession = {
    key,
    initialText,
    maxChars,
    text: initialText,
    restored: false,
    observedRaw: storage ? null : undefined,
  };

  if (!storage) {
    return typeof window === "undefined"
      ? base
      : {
          ...base,
          storageError:
            "Saved drafts are unavailable on this device; your current text is still available.",
        };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(key));
    base.observedRaw = raw;
  } catch {
    return {
      ...base,
      storageError:
        "Saved drafts could not be loaded on this device; your current text is still available.",
    };
  }
  if (!raw) return base;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Partial<StoredDraft>).version !== 1 ||
      typeof (parsed as Partial<StoredDraft>).text !== "string"
    ) {
      throw new Error("invalid draft");
    }
    const draftText = (parsed as StoredDraft).text;
    if (
      !draftText ||
      draftText.length > maxChars ||
      draftText === initialText
    ) {
      if (storage.getItem(storageKey(key)) === raw) {
        storage.removeItem(storageKey(key));
        base.observedRaw = null;
      }
      return base;
    }
    return { ...base, text: draftText, restored: true, observedRaw: raw };
  } catch {
    try {
      if (storage.getItem(storageKey(key)) === raw) {
        storage.removeItem(storageKey(key));
        base.observedRaw = null;
      }
    } catch {
    }
    return {
      ...base,
      storageError:
        "A saved draft could not be restored; your current text is still available.",
    };
  }
}

function sameSession(
  session: DraftSession,
  key: string,
  initialText: string,
  maxChars: number,
): boolean {
  return (
    session.key === key &&
    session.initialText === initialText &&
    session.maxChars === maxChars
  );
}

export function useDraftText(
  key: string,
  initialText: string,
  maxChars: number,
): DraftTextState {
  const boundedMaxChars = limitFor(maxChars);
  const loadedForInputs = useMemo(
    () => initialSession(key, initialText, boundedMaxChars),
    [key, initialText, boundedMaxChars],
  );
  const [session, setSession] = useState<DraftSession>(loadedForInputs);

  // A refresh of initialText for the same key must not flash a stale
  // localStorage value over an in-progress draft. An actual key switch loads
  // the other key's saved draft during this render.
  const activeSession =
    session.key !== key
      ? loadedForInputs
      : sameSession(session, key, initialText, boundedMaxChars)
        ? session
        : {
            ...session,
            key,
            initialText,
            maxChars: boundedMaxChars,
            text:
              session.restored || session.text !== session.initialText
                ? session.text
                : initialText,
          };

  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const pendingRef = useRef<PendingDraft | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(false);
  const ownerRef = useRef<symbol | null>(null);
  if (ownerRef.current === null) ownerRef.current = Symbol("draft");

  const setStorageError = useCallback(
    (draftKey: string, message: string | undefined) => {
      if (!mountedRef.current) return;
      setSession((current) =>
        current.key === draftKey && current.storageError !== message
          ? { ...current, storageError: message }
          : current,
      );
    },
    [],
  );

  const flush = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    const storage = localStorageOrUndefined();
    if (!storage) {
      if (typeof window !== "undefined") {
        setStorageError(
          pending.key,
          "Saved drafts are unavailable on this device; your current text is still available.",
        );
      }
      return;
    }

    try {
      const currentRaw = storage.getItem(storageKey(pending.key));
      if (currentRaw !== pending.observedRaw) {
        setStorageError(pending.key, STORAGE_CONFLICT_WARNING);
        return;
      }
      let nextRaw: string | null = null;
      if (!pending.text || pending.text === pending.initialText) {
        storage.removeItem(storageKey(pending.key));
      } else if (pending.text.length > pending.maxChars) {
        // Keep oversized text editable in memory, but never write an
        // unbounded value to localStorage.
        setStorageError(
          pending.key,
          "This draft is too large to save on this device; your current text is still available.",
        );
        return;
      } else {
        const record: StoredDraft = { version: 1, text: pending.text };
        nextRaw = JSON.stringify(record);
        storage.setItem(storageKey(pending.key), nextRaw);
      }
      if (activeSessionRef.current.key === pending.key) {
        activeSessionRef.current = {
          ...activeSessionRef.current,
          observedRaw: nextRaw,
        };
        updateActiveDraft(
          pending.key,
          ownerRef.current!,
          activeSessionRef.current.text,
          nextRaw,
        );
        if (mountedRef.current) {
          setSession((current) =>
            current.key === pending.key
              ? { ...current, observedRaw: nextRaw }
              : current,
          );
        }
      }
      setStorageError(pending.key, undefined);
    } catch {
      setStorageError(
        pending.key,
        "This draft could not be saved on this device; your current text is still available.",
      );
    }
  }, [setStorageError]);

  useEffect(() => {
    setSession((current) =>
      current.key === key &&
      sameSession(current, key, initialText, boundedMaxChars)
        ? current
        : activeSession,
    );
  }, [activeSession, boundedMaxChars, initialText, key]);

  useEffect(() => {
    if (activeSession.key !== key) return;
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;

    const text = activeSession.text;
    if (!text || text === initialText) {
      pendingRef.current = null;
      const storage = localStorageOrUndefined();
      if (storage) {
        try {
          const currentRaw = storage.getItem(storageKey(key));
          if (currentRaw !== activeSession.observedRaw) {
            setStorageError(key, STORAGE_CONFLICT_WARNING);
            return;
          }
          storage.removeItem(storageKey(key));
          activeSessionRef.current = {
            ...activeSessionRef.current,
            observedRaw: null,
          };
          updateActiveDraft(key, ownerRef.current!, text, null);
          if (mountedRef.current) {
            setSession((current) =>
              current.key === key ? { ...current, observedRaw: null } : current,
            );
          }
          setStorageError(key, undefined);
        } catch {
          setStorageError(
            key,
            "This draft could not be cleared on this device; your current text is still available.",
          );
        }
      } else if (typeof window !== "undefined") {
        setStorageError(
          key,
          "Saved drafts are unavailable on this device; your current text is still available.",
        );
      }
      return;
    }

    pendingRef.current = {
      key,
      initialText,
      maxChars: boundedMaxChars,
      text,
      observedRaw: activeSession.observedRaw,
    };
    timerRef.current = setTimeout(flush, WRITE_DELAY_MS);
  }, [
    activeSession.key,
    activeSession.text,
    boundedMaxChars,
    flush,
    initialText,
    key,
    setStorageError,
  ]);

  const replaceAccepted = useCallback(
    (
      ownerKey: string,
      expectedText: string,
      replacementText: string,
      storageError?: string,
      observedRaw?: string | null,
    ): boolean => {
      if (!mountedRef.current) return false;
      const current = activeSessionRef.current;
      if (current.key !== ownerKey || current.text !== expectedText) {
        return false;
      }
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      pendingRef.current = null;
      const nextSession: DraftSession = {
        ...current,
        text: replacementText,
        restored: false,
        storageError,
        observedRaw,
      };
      activeSessionRef.current = nextSession;
      updateActiveDraft(
        ownerKey,
        ownerRef.current!,
        nextSession.text,
        nextSession.observedRaw,
      );
      setSession(nextSession);
      return true;
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const onPageHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    mountedRef.current = true;
    registerActiveDraft(
      key,
      ownerRef.current!,
      activeSessionRef.current.text,
      activeSessionRef.current.observedRaw,
      (expectedText, replacementText, observedRaw) =>
        replaceAccepted(
          key,
          expectedText,
          replacementText,
          undefined,
          observedRaw,
        ),
    );
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // This cleanup also runs before a key/identity switch, so a pending
      // value is flushed while its original key still owns it.
      flush();
      unregisterActiveDraft(key, ownerRef.current!);
      mountedRef.current = false;
    };
  }, [boundedMaxChars, flush, initialText, key, replaceAccepted]);

  const setText = useCallback<Dispatch<SetStateAction<string>>>(
    (next) => {
      const current = activeSessionRef.current;
      const value = typeof next === "function" ? next(current.text) : next;
      const nextText = String(value);
      const nextSession: DraftSession = {
        key,
        initialText,
        maxChars: boundedMaxChars,
        text: nextText,
        restored: false,
        storageError: current.storageError,
        observedRaw: current.observedRaw,
      };

      // React effects are passive. Queue synchronously as well so pagehide or
      // unmount immediately after a keystroke still captures the latest text.
      activeSessionRef.current = nextSession;
      updateActiveDraft(
        key,
        ownerRef.current!,
        nextSession.text,
        nextSession.observedRaw,
      );
      pendingRef.current = {
        key,
        initialText,
        maxChars: boundedMaxChars,
        text: nextSession.text,
        observedRaw: nextSession.observedRaw,
      };
      setSession(nextSession);
    },
    [boundedMaxChars, initialText, key],
  );

  const accept = useCallback(
    (expectedText: string, replacementText = initialText): boolean => {
      // A replacement component can have an unsaved edit that is newer than
      // the persisted record. Keep it even when this callback ran after the
      // original component unmounted.
      if (anotherActiveDraftDiffers(key, expectedText)) return false;
      const current = activeSessionRef.current;
      const ownsCurrentKey = mountedRef.current && current.key === key;
      if (ownsCurrentKey && current.text !== expectedText) return false;
      const hasActiveOwner = activeDrafts.has(key);

      const storage = localStorageOrUndefined();
      let acceptanceStorageError: string | undefined;
      let acceptanceObservedRaw: string | null | undefined =
        current.observedRaw;
      if (storage) {
        try {
          const raw = storage.getItem(storageKey(key));
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            const storedMatches =
              !!parsed &&
              typeof parsed === "object" &&
              (parsed as Partial<StoredDraft>).version === 1 &&
              typeof (parsed as Partial<StoredDraft>).text === "string" &&
              (parsed as StoredDraft).text === expectedText;
            const rawMatchesObserved =
              activeObservedRawMatches(key, raw) ||
              (!hasActiveOwner && current.observedRaw === raw);
            // A mounted owner may accept a stale record only when that record
            // is the last snapshot this key observed. A foreign newer record
            // is a conflict even if the mounted text has not changed.
            if (!storedMatches && !rawMatchesObserved) {
              if (ownsCurrentKey) {
                setStorageError(key, STORAGE_CONFLICT_WARNING);
              }
              return false;
            }
          }
          storage.removeItem(storageKey(key));
          acceptanceObservedRaw = null;
        } catch {
          if (!ownsCurrentKey) {
            return false;
          }
          acceptanceStorageError =
            "This draft could not be cleared on this device; your current text is still available.";
        }
      } else if (ownsCurrentKey) {
        // The server accepted the current in-memory draft even when this
        // device cannot persist drafts. Clear the input, but keep the warning.
        acceptanceStorageError =
          "Saved drafts are unavailable on this device; your current text is still available.";
      } else if (!hasActiveOwner) {
        return false;
      }

      const replaced = replaceActiveDrafts(
        key,
        expectedText,
        replacementText,
        acceptanceObservedRaw,
      );
      if (replaced && ownsCurrentKey && acceptanceStorageError) {
        setStorageError(key, acceptanceStorageError);
      }
      if (ownsCurrentKey && !replaced) {
        replaceAccepted(
          key,
          expectedText,
          replacementText,
          acceptanceStorageError,
          acceptanceObservedRaw,
        );
        return true;
      }
      // With no mounted instance there is no React state to update. Removing
      // the exact persisted value above is the complete acceptance operation.
      return replaced || !hasActiveOwner;
    },
    [initialText, key, replaceAccepted, setStorageError],
  );

  const discard = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    pendingRef.current = null;
    let storageError: string | undefined;
    let observedRaw = activeSessionRef.current.observedRaw;
    const storage = localStorageOrUndefined();
    if (storage) {
      try {
        const currentRaw = storage.getItem(storageKey(key));
        if (currentRaw !== observedRaw) {
          storageError = STORAGE_CONFLICT_WARNING;
        } else {
          storage.removeItem(storageKey(key));
          observedRaw = null;
        }
      } catch {
        storageError =
          "This draft could not be cleared on this device; your current text is still available.";
      }
    } else if (typeof window !== "undefined") {
      storageError =
        "Saved drafts are unavailable on this device; your current text is still available.";
    }
    const nextSession: DraftSession = {
      key,
      initialText,
      maxChars: boundedMaxChars,
      text: initialText,
      restored: false,
      storageError,
      observedRaw,
    };
    activeSessionRef.current = nextSession;
    updateActiveDraft(
      key,
      ownerRef.current!,
      nextSession.text,
      nextSession.observedRaw,
    );
    setSession(nextSession);
  }, [boundedMaxChars, initialText, key]);

  return {
    text: activeSession.text,
    setText,
    discard,
    accept,
    clearIfUnchanged: accept,
    storageError: activeSession.storageError,
    restored: activeSession.restored,
  };
}
