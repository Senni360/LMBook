import { useEffect, useState } from "react";
import { Search, LoaderCircle, Check, Square } from "lucide-react";
import { InkButton } from "../InkControl";
import { aiApi } from "../../ai-api";
import type {
  LocalModelStatus,
  LocalModelCheckResult,
} from "../../../shared/local-models";
import type { useVaultSemantic } from "./useVaultSemantic";

export function VaultIndexPanel({
  vaultId,
  semantic,
  onFind,
}: {
  vaultId: string;
  semantic: ReturnType<typeof useVaultSemantic>;
  onFind: () => void;
}) {
  const [model, setModel] = useState<LocalModelStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void aiApi<LocalModelStatus>(
      "/local-models/status",
      "GET",
      undefined,
      abort.signal,
    )
      .then(setModel)
      .catch(() => {});
    return () => abort.abort();
  }, [vaultId, expanded]);
  const state = semantic.semanticStatus;
  async function buildLocal() {
    setBusy(true);
    setError("");
    try {
      const checked = await aiApi<LocalModelCheckResult>(
        "/local-models/check",
        "POST",
      );
      if (!checked.ok)
        throw new Error(
          checked.error ||
            "Local search needs repair. Open Settings → Local AI.",
        );
      await aiApi("/local-models/enabled", "POST", { enabled: true });
      await semantic.onSemanticModeChange("local");
      await semantic.onBuildSemanticIndex(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace-index">
      <div className="workspace-index-line">
        <InkButton
          className="button small quiet"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <Search size={15} /> Search by meaning
        </InkButton>
        <span role="status">
          {busy
            ? "Checking the local model…"
            : state?.running
              ? `${state.cancelling ? "Stopping" : "Indexing"} · ${state.completed} of ${state.total} notes`
              : state?.updatedAt
                ? `${state.completed} notes indexed · ${state.identity?.kind === "cloud" ? "OpenRouter" : "on this computer"}`
                : "Not indexed yet"}
        </span>
        {state?.running && (
          <InkButton
            className="button small"
            disabled={state.cancelling || semantic.semanticPending}
            onClick={() => void semantic.onCancelSemanticIndex()}
          >
            <Square size={13} />
            Stop
          </InkButton>
        )}
        {!state?.running && state?.updatedAt && (
          <InkButton className="button small quiet" onClick={onFind}>
            Try a search
          </InkButton>
        )}
      </div>
      {expanded && (
        <div className="workspace-index-body">
          <p>
            Build a search index to find passages by meaning, even across
            languages. Questions, flashcards and audio can use your saved notes
            without this extra index.
          </p>
          <div className="actions">
            <InkButton
              className="button primary small"
              disabled={
                busy ||
                semantic.semanticPending ||
                state?.running ||
                !model?.downloaded
              }
              onClick={() => void buildLocal()}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Check size={15} />
              )}
              {state?.updatedAt
                ? "Update local index"
                : "Enable local search & index"}
            </InkButton>
            {!model?.downloaded && (
              <span className="fine-print">
                Install the search model in Settings → Local AI first.
              </span>
            )}
          </div>
          <p className="fine-print">
            Indexing runs only when you ask. Update it after changing notes;
            ordinary filename and text search remain available.
          </p>
          <details>
            <summary>Use OpenRouter instead</summary>
            <p className="fine-print">
              This sends note passages to OpenRouter’s embedding provider and
              uses API credits. Connect OpenRouter in Settings first.
            </p>
            <InkButton
              className="button small"
              disabled={busy || semantic.semanticPending || state?.running}
              onClick={async () => {
                await semantic.onSemanticModeChange("openrouter");
                await semantic.onBuildSemanticIndex(true);
              }}
            >
              Send notes to OpenRouter & index
            </InkButton>
          </details>
        </div>
      )}
      {(error || semantic.semanticError) && (
        <p className="inline-error" role="alert">
          {error || semantic.semanticError}
        </p>
      )}
    </div>
  );
}
