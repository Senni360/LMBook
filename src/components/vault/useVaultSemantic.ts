import { useCallback, useEffect, useRef, useState } from "react";
import type {
  VaultSemanticPreference,
  VaultSemanticSearchResult,
  VaultSemanticStatus,
} from "../../../shared/vault-semantic";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-sennibook": "1",
      ...(init?.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Semantic search failed.");
  return body as T;
}
type Snapshot = {
  status: VaultSemanticStatus;
  preference: VaultSemanticPreference;
};

export function useVaultSemantic(vaultId: string) {
  const [status, setStatus] = useState<VaultSemanticStatus | null>(null);
  const [mode, setMode] = useState<VaultSemanticPreference>("lexical");
  const [error, setError] = useState<string | null>(null);
  const [semanticPending, setSemanticPending] = useState(false);
  const epoch = useRef(0),
    mounted = useRef(false);
  const queryAbort = useRef<AbortController | null>(null),
    pollAbort = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false),
    modeQueue = useRef(Promise.resolve());
  const current = useCallback(
    (v: string, e: number) =>
      mounted.current && v === vaultId && e === epoch.current,
    [vaultId],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!vaultId) return;
      const v = vaultId,
        e = epoch.current;
      try {
        const value = await request<Snapshot>(`/api/vaults/${v}/semantic`, {
          signal,
        });
        if (!current(v, e)) return;
        setStatus(value.status);
        setMode(value.preference);
        setError(value.status.error);
      } catch (reason) {
        if (current(v, e) && (reason as Error).name !== "AbortError")
          setError(
            reason instanceof Error
              ? reason.message
              : "Semantic search unavailable.",
          );
      }
    },
    [current, vaultId],
  );
  useEffect(() => {
    epoch.current += 1;
    const e = epoch.current;
    mounted.current = true;
    setStatus(null);
    setError(null);
    pollAbort.current?.abort();
    const abort = new AbortController();
    void refresh(abort.signal);
    return () => {
      if (epoch.current === e) epoch.current += 1;
      mounted.current = false;
      abort.abort();
      pollAbort.current?.abort();
      queryAbort.current?.abort();
    };
  }, [refresh, vaultId]);
  useEffect(() => {
    if (!status?.running || !vaultId) return;
    const v = vaultId,
      e = epoch.current,
      abort = new AbortController();
    let stopped = false;
    pollAbort.current?.abort();
    pollAbort.current = abort;
    const poll = async () => {
      if (stopped || abort.signal.aborted || !current(v, e)) return;
      await refresh(abort.signal);
      if (!stopped && !abort.signal.aborted && current(v, e))
        window.setTimeout(() => void poll(), 1500);
    };
    void poll();
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [current, refresh, status?.running, vaultId]);
  const search = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<{
      results: VaultSemanticSearchResult[];
      status: VaultSemanticStatus;
    }> => {
      const v = vaultId,
        e = epoch.current;
      queryAbort.current?.abort();
      queryAbort.current = new AbortController();
      try {
        const value = await request<{
          results: VaultSemanticSearchResult[];
          status: VaultSemanticStatus;
        }>(`/api/vaults/${v}/semantic/search?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.any([signal, queryAbort.current.signal]),
        });
        if (current(v, e)) {
          setStatus(value.status);
          setError(value.status.error);
        }
        return value;
      } catch (reason) {
        if (current(v, e) && (reason as Error).name !== "AbortError")
          setError(
            reason instanceof Error
              ? reason.message
              : "Semantic search failed.",
          );
        throw reason;
      }
    },
    [current, vaultId],
  );
  const changeMode = useCallback(
    (next: VaultSemanticPreference) => {
      const v = vaultId,
        e = epoch.current;
      const operation = async () => {
        if (!current(v, e) || mutationBusy.current) return;
        mutationBusy.current = true;
        setSemanticPending(true);
        setError(null);
        try {
          if (status?.running)
            await request(`/api/vaults/${v}/semantic/cancel`, {
              method: "POST",
              body: "{}",
            });
          await request(`/api/vaults/${v}/semantic/preference`, {
            method: "PUT",
            body: JSON.stringify({ mode: next }),
          });
          if (current(v, e)) await refresh();
        } catch (reason) {
          if (current(v, e))
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not change semantic mode.",
            );
        } finally {
          mutationBusy.current = false;
          if (current(v, e)) setSemanticPending(false);
        }
      };
      modeQueue.current = modeQueue.current.then(operation, operation);
      return modeQueue.current;
    },
    [current, refresh, status?.running, vaultId],
  );
  const build = useCallback(
    async (allowCloud: boolean) => {
      if (mutationBusy.current) return;
      const v = vaultId,
        e = epoch.current;
      if (!current(v, e)) return;
      mutationBusy.current = true;
      setSemanticPending(true);
      setError(null);
      try {
        await request(`/api/vaults/${v}/semantic/index`, {
          method: "POST",
          body: JSON.stringify({ allowCloud }),
        });
        if (current(v, e)) await refresh();
      } catch (reason) {
        if (current(v, e))
          setError(
            reason instanceof Error ? reason.message : "Indexing failed.",
          );
      } finally {
        mutationBusy.current = false;
        if (current(v, e)) setSemanticPending(false);
      }
    },
    [current, refresh, vaultId],
  );
  const cancel = useCallback(async () => {
    if (mutationBusy.current) return;
    const v = vaultId,
      e = epoch.current;
    if (!current(v, e)) return;
    mutationBusy.current = true;
    setSemanticPending(true);
    try {
      await request(`/api/vaults/${v}/semantic/cancel`, {
        method: "POST",
        body: "{}",
      });
      if (current(v, e)) await refresh();
    } catch (reason) {
      if (current(v, e))
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not cancel indexing.",
        );
    } finally {
      mutationBusy.current = false;
      if (current(v, e)) setSemanticPending(false);
    }
  }, [current, refresh, vaultId]);
  return {
    semanticSearch: search,
    semanticStatus: status,
    semanticMode: mode,
    semanticError: error,
    semanticPending,
    onSemanticModeChange: changeMode,
    onBuildSemanticIndex: build,
    onCancelSemanticIndex: cancel,
  };
}
