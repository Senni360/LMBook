import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Vault } from "../../shared/vault";
import type { WorkspaceSyncResult } from "../../shared/notebook-workspace";
import { VaultWorkspace } from "./VaultWorkspace";
import { InkButton } from "./InkControl";
import { aiApi } from "../ai-api";
import { WorkspaceVaultContext } from "../workspace-context";
import "./notebook-workspace.css";

export function NotebookWorkspace({
  notebookId,
  title,
  sourceFingerprint,
  notebooks,
  openRequest,
  onRefresh,
  onOpenNotebook,
  children,
}: {
  notebookId: string;
  title: string;
  sourceFingerprint: string;
  notebooks: { id: string; title: string }[];
  openRequest?: { vaultId: string; path: string; nonce: number } | null;
  onRefresh: () => Promise<void>;
  onOpenNotebook: (
    id: string,
    section?: "sources" | "chat" | "flashcards" | "studio",
  ) => Promise<void>;
  children: ReactNode;
}) {
  const [vault, setVault] = useState<Vault | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<WorkspaceSyncResult | null>(null);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const pending = useRef<Promise<void> | null>(null);
  const alive = useRef(true);
  const sync = useCallback(() => {
    if (pending.current) return pending.current;
    setSyncing(true);
    pending.current = (async () => {
      try {
        const result = await aiApi<WorkspaceSyncResult>(
          `/notebooks/${notebookId}/workspace/sync`,
          "POST",
        );
        if (!alive.current) return;
        setReport(result);
        setInventoryRevision((value) => value + 1);
        setError("");
        await refresh.current();
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      } finally {
        pending.current = null;
        if (alive.current) setSyncing(false);
      }
    })();
    return pending.current;
  }, [notebookId]);
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void aiApi<{ vault: Vault }>(
      `/notebooks/${notebookId}/workspace`,
      "POST",
      {},
      abort.signal,
    )
      .then((result) => {
        if (!abort.signal.aborted) {
          setVault(result.vault);
          void sync();
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, [notebookId, attempt, sync]);
  useEffect(() => {
    if (!vault) return;
    const focused = () => {
      if (!document.hidden) void sync();
    };
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [vault, sync]);
  useEffect(() => {
    if (vault) void sync();
  }, [sourceFingerprint, vault, sync]);
  return (
    <div className="notebook-workspace">
      {error && (
        <div className="alert error" role="alert">
          <span>{error}</span>
          <InkButton
            className="button"
            onClick={() => (vault ? void sync() : setAttempt((x) => x + 1))}
          >
            Retry
          </InkButton>
        </div>
      )}
      {vault ? (
        <VaultWorkspace
          active
          forcedVault={vault}
          inventoryRevision={inventoryRevision}
          workspaceTitle={title}
          notebooks={notebooks}
          currentNotebook={notebookId}
          openRequest={openRequest}
          onOpenNotebook={onOpenNotebook}
          onSourcesAdded={async () => refresh.current()}
          onNoteSaved={sync}
          learningContent={
            <>
              <div className="workspace-sync">
                <span role="status">
                  {syncing
                    ? "Updating notes for learning…"
                    : error
                      ? "Notes could not be synced"
                      : report?.warnings.length
                        ? "Notes synced with notices"
                        : "Notes synced for learning"}
                </span>
                <InkButton
                  className="button small quiet"
                  disabled={syncing}
                  onClick={() => void sync()}
                >
                  Sync notes
                </InkButton>
              </div>
              {!!report?.warnings.length && (
                <details className="workspace-sync-warnings">
                  <summary>
                    {report.warnings.length} notes need attention
                  </summary>
                  {report.warnings.map((item, i) => (
                    <p key={i}>
                      {item.path && <strong>{item.path}: </strong>}
                      {item.message}
                    </p>
                  ))}
                </details>
              )}
              {!!report?.excluded && (
                <p className="fine-print workspace-sync-warnings">
                  {report.excluded === 1
                    ? "One note removed from learning remains"
                    : `${report.excluded} notes removed from learning remain`}{" "}
                  in the folder. Use Summarize → selected-note tools to add them
                  again.
                </p>
              )}
              <WorkspaceVaultContext.Provider value={vault.id}>
                {children}
              </WorkspaceVaultContext.Provider>
            </>
          }
        />
      ) : (
        !error && <p role="status">Opening notebook files…</p>
      )}
    </div>
  );
}
