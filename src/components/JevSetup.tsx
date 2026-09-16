import { useEffect, useState } from "react";
import { Check, LoaderCircle, Unplug } from "lucide-react";
import { aiApi } from "../ai-api";
import { InkButton, InkInput } from "./InkControl";
import {
  defaultJevFeatures,
  type JevConnectionStatus,
  type JevFeature,
} from "../../shared/jev";
import "./ai-setup.css";

const features: { id: JevFeature; title: string; text: string }[] = [
  {
    id: "notebookReview",
    title: "Notebook checks",
    text: "Review selected sources for organization, relationships and learning support, and inspect flashcard quality. Run these checks from a notebook.",
  },
  {
    id: "connections",
    title: "Background link checks",
    text: "Check a proposed connection against both notes before it can be added. Uses only the notes selected for that notebook's assistant.",
  },
  {
    id: "searchRanking",
    title: "Search ranking",
    text: "After a meaning search, send your query and the top 10 short excerpts to TypeSafe to improve their order. This also sends excerpts when your search index is local.",
  },
];
export function JevSetup() {
  const [status, setStatus] = useState<JevConnectionStatus | null>(null);
  const [enabled, setEnabled] = useState({ ...defaultJevFeatures });
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      aiApi<JevConnectionStatus>(
        "/connections/jev",
        "GET",
        undefined,
        controller.signal,
      ),
      aiApi<typeof defaultJevFeatures>(
        "/jev/features",
        "GET",
        undefined,
        controller.signal,
      ),
    ])
      .then(([connection, settings]) => {
        setStatus(connection);
        setEnabled(settings);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const connect = async (action: "connect" | "check" | "disconnect") => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await aiApi<{ ok: boolean; message: string }>(
        `/connections/jev${action === "check" ? "/check" : ""}`,
        action === "disconnect" ? "DELETE" : "POST",
        action === "connect" ? { apiKey: key.trim() } : undefined,
      );
      if (!result.ok) throw Error(result.message);
      if (action === "connect") setKey("");
      setMessage(result.message);
      setStatus(await aiApi("/connections/jev"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (id: JevFeature, value: boolean) => {
    const previous = enabled;
    setEnabled({ ...enabled, [id]: value });
    setBusy(true);
    setError("");
    try {
      setEnabled(
        await aiApi("/jev/features", "PUT", { ...enabled, [id]: value }),
      );
      setMessage("Jev feature settings saved.");
    } catch (e) {
      setEnabled(previous);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-connection jev-connection">
      <div className="ai-status-line">
        <strong>TypeSafe Jev</strong>
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
        Fast, structured checks alongside Luna. Try each feature independently
        and mark which suggestions help.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void connect("connect");
        }}
      >
        <label className="field" htmlFor="jev-key">
          <span>
            {status?.configured ? "Replace TypeSafe key" : "TypeSafe API key"}
          </span>
          <InkInput
            id="jev-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={512}
            disabled={busy}
            placeholder="Paste your TypeSafe API key"
            aria-describedby="jev-key-help"
          />
        </label>
        <p id="jev-key-help" className="fine-print">
          Stored on this computer, outside notebook backups. Jev connects
          directly to TypeSafe and uses its API credits. Connecting checks a
          tiny example without sending your notes.
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
            )}{" "}
            {status?.configured ? "Replace key & connect" : "Connect TypeSafe"}
          </InkButton>
          {status?.configured && (
            <InkButton
              className="button"
              type="button"
              disabled={busy}
              onClick={() => void connect("check")}
            >
              Check Jev connection
            </InkButton>
          )}
          {status?.source === "saved" && (
            <InkButton
              className="button quiet"
              type="button"
              disabled={busy}
              onClick={() => void connect("disconnect")}
            >
              <Unplug size={16} />
              Remove TypeSafe key
            </InkButton>
          )}
          <a
            href="https://console.typesafe.ai"
            target="_blank"
            rel="noreferrer"
          >
            TypeSafe console
          </a>
        </div>
      </form>
      {status?.source === "environment" && (
        <p className="fine-print">
          Using TYPESAFE_API_KEY from this computer's environment. Remove that
          variable to disconnect.
        </p>
      )}
      <fieldset className="jev-feature-settings">
        <legend>Where Jev helps</legend>
        <p className="fine-print">
          Enable a feature to allow its described text to be sent to TypeSafe.
          These are model judgments, not verified facts; your original material
          and permission mode stay authoritative.
        </p>
        {features.map((feature) => (
          <label className="jev-feature" key={feature.id}>
            <InkInput
              type="checkbox"
              checked={enabled[feature.id]}
              disabled={busy || (!status?.configured && !enabled[feature.id])}
              onChange={(e) => void toggle(feature.id, e.target.checked)}
            />
            <span>
              <strong>{feature.title}</strong>
              <small>{feature.text}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {message && (
        <p role="status" className="fine-print">
          {message}
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
