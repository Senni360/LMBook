import { useEffect, useState } from "react";
import { Check, ExternalLink, LoaderCircle, Unplug } from "lucide-react";
import { InkInput, InkButton, InkSelect } from "./InkControl";
import { aiApi } from "../ai-api";
import "./ai-setup.css";

type Connection = {
  configured: boolean;
  source: "saved" | "environment" | "none";
};
export function OpenRouterSetup() {
  const [status, setStatus] = useState<Connection | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    aiApi<Connection>(
      "/connections/openrouter",
      "GET",
      undefined,
      controller.signal,
    )
      .then(setStatus)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  async function perform(action: "connect" | "check" | "disconnect") {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await aiApi<{ ok?: boolean; message?: string }>(
        `/connections/openrouter${action === "check" ? "/check" : ""}`,
        action === "disconnect" ? "DELETE" : "POST",
        action === "connect" ? { apiKey: key.trim() } : undefined,
      );
      if (result.ok === false) throw new Error(result.message);
      if (action === "connect") setKey("");
      const next = await aiApi<Connection>("/connections/openrouter");
      setStatus(next);
      setFeedback(
        result.message ||
          (next.configured
            ? "OpenRouter is connected."
            : "OpenRouter disconnected."),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ai-connection">
      <div className="ai-status-line">
        <strong>OpenRouter</strong>
        <span
          className={`badge ${status?.configured ? "covered" : "unmapped"}`}
        >
          {status
            ? status.configured
              ? "Key configured"
              : "Not connected"
            : "Checking…"}
        </span>
      </div>
      <p>
        Connect optional hosted models for writing and finding related notes.
        Luna continues to use your Codex subscription.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform("connect");
        }}
      >
        <label className="field" htmlFor="openrouter-key">
          <span>
            {status?.configured
              ? "Replace OpenRouter key"
              : "OpenRouter API key"}
          </span>
          <InkInput
            id="openrouter-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={512}
            disabled={busy}
            placeholder="Paste your API key"
            aria-describedby="openrouter-key-help"
          />
        </label>
        <p id="openrouter-key-help" className="fine-print">
          Stored on this computer, outside notebook backups. OpenRouter usage is
          billed separately from your OpenAI subscription.
        </p>
        <div className="ai-actions">
          <InkButton
            className="button primary"
            type="submit"
            disabled={busy || !key.trim()}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            {status?.configured
              ? "Replace key & connect"
              : "Connect OpenRouter"}
          </InkButton>
          {status?.configured && (
            <InkButton
              className="button"
              type="button"
              disabled={busy}
              onClick={() => void perform("check")}
            >
              Check connection
            </InkButton>
          )}
          {status?.source === "saved" && (
            <InkButton
              className="button quiet"
              type="button"
              disabled={busy}
              onClick={() => void perform("disconnect")}
            >
              <Unplug size={16} />
              Remove saved key
            </InkButton>
          )}
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get an API key <ExternalLink size={14} />
          </a>
        </div>
      </form>
      {status?.source === "environment" && (
        <p className="fine-print">
          This connection comes from OPENROUTER_API_KEY on this computer. Remove
          that environment setting to disconnect it.
        </p>
      )}
      {feedback && (
        <p role="status" className="fine-print">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}

type Model = {
  id: string;
  name: string;
  inputModalities: string[];
  outputModalities: string[];
  promptPricePerToken: string | null;
  completionPricePerToken: string | null;
};
export function OpenRouterModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setModels(await aiApi<Model[]>("/openrouter/models"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = models.find((m) => m.id === value);
  const price = (text: string | null) =>
    text !== null && Number.isFinite(Number(text))
      ? `$${(Number(text) * 1e6).toFixed(2)}`
      : "Not listed";
  return (
    <div className="ai-model-picker">
      <InkButton
        className="button quiet"
        disabled={disabled || busy}
        onClick={() => void load()}
      >
        {busy ? "Loading models…" : "Browse available models"}
      </InkButton>
      {models.length > 0 && (
        <label className="field">
          <span>Available writing models</span>
          <InkSelect
            value={models.some((m) => m.id === value) ? value : ""}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>
              Choose a model
            </option>
            {models
              .filter(
                (m) =>
                  !/luna/i.test(m.id) &&
                  m.outputModalities.includes("text") &&
                  m.inputModalities.includes("text"),
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </InkSelect>
        </label>
      )}
      {selected && (
        <p className="fine-print">
          Catalogue price per million tokens:{" "}
          {price(selected.promptPricePerToken)} input ·{" "}
          {price(selected.completionPricePerToken)} output. Router fees and
          model-specific charges may also apply.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
