import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Minus,
} from "lucide-react";
import type { CodexOnboardingStatus } from "../../shared/onboarding";
import { aiApi } from "../ai-api";
import { InkButton } from "./InkControl";
import "./ai-setup.css";

export type OnboardingStatus = {
  required: boolean;
  connection: CodexOnboardingStatus;
};

export function CodexSetup({
  initial,
  onVerified,
}: {
  initial?: CodexOnboardingStatus;
  onVerified?: (status: CodexOnboardingStatus) => void;
}) {
  const [status, setStatus] = useState<CodexOnboardingStatus | null>(
    initial || null,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [probe, setProbe] = useState("");
  const mounted = useRef(true);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  const accept = useCallback((next: CodexOnboardingStatus) => {
    if (!mounted.current) return;
    setStatus(next);
    onVerifiedRef.current?.(next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!initial)
      void aiApi<CodexOnboardingStatus>("/connections/codex/login")
        .then(accept)
        .catch((e) => {
          if (mounted.current) setError(e.message);
        });
    return () => {
      mounted.current = false;
    };
  }, [accept]);
  useEffect(() => {
    if (status?.state !== "login-pending") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        accept(
          await aiApi<CodexOnboardingStatus>(
            "/connections/codex/login",
            "GET",
            undefined,
            controller.signal,
          ),
        );
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1500);
      }
    };
    timer = setTimeout(poll, 1500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [status?.state, accept]);
  async function act(action: "check" | "login" | "cancel" | "probe") {
    setBusy(action);
    setError("");
    try {
      if (action === "probe") {
        const result = await aiApi<{ message: string }>(
          "/onboarding/probe",
          "POST",
        );
        if (mounted.current) setProbe(result.message);
      } else {
        accept(
          await aiApi<CodexOnboardingStatus>(
            action === "check"
              ? "/onboarding/check"
              : action === "cancel"
                ? "/connections/codex/login/cancel"
                : "/connections/codex/login",
            "POST",
          ),
        );
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  const checking = busy === "check";
  const pending = status?.state === "login-pending";
  const installed = status !== null && status.state !== "missing-cli";
  return (
    <div className="ai-connection">
      <ul className="ai-readiness-list">
        <li>
          {installed ? <Check size={18} /> : <Minus size={18} />}
          <div>
            <strong>Codex CLI</strong>
            <p>
              {installed
                ? "Found on this computer"
                : status
                  ? "Install the CLI, then check again below."
                  : "Check for an existing installation and login."}
            </p>
          </div>
        </li>
        <li>
          {status?.ok ? (
            <Check size={18} />
          ) : pending || checking ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Minus size={18} />
          )}
          <div>
            <strong>OpenAI subscription</strong>
            <p>
              {status?.message ||
                "Use the same ChatGPT account you use with Codex."}
            </p>
          </div>
        </li>
        {status?.lunaAvailable !== undefined && (
          <li>
            {status.lunaAvailable ? (
              <Check size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
            <div>
              <strong>GPT-5.6 Luna</strong>
              <p>
                {status.lunaAvailable
                  ? "Available through your Codex connection"
                  : "Luna is not listed for this account. Check your plan or update the CLI."}
              </p>
            </div>
          </li>
        )}
      </ul>
      <div className="ai-actions">
        {!pending && (
          <InkButton
            className="button primary"
            disabled={!!busy}
            onClick={() => void act("check")}
          >
            {checking && <LoaderCircle size={16} className="spin" />}
            {checking ? "Checking account & CLI…" : "Check existing connection"}
          </InkButton>
        )}
        {installed && !pending && (
          <InkButton
            className="button"
            disabled={!!busy}
            onClick={() => void act("login")}
          >
            {busy === "login"
              ? "Preparing sign-in…"
              : status?.ok
                ? "Use another account"
                : "Sign in with ChatGPT"}
          </InkButton>
        )}
        {pending && status.authUrl && (
          <a
            className="button primary"
            href={status.authUrl}
            target="_blank"
            rel="noreferrer"
          >
            Continue sign-in in browser <ExternalLink size={16} />
          </a>
        )}
        {pending && (
          <InkButton
            className="button quiet"
            disabled={!!busy}
            onClick={() => void act("cancel")}
          >
            Cancel sign-in
          </InkButton>
        )}
      </div>
      {!installed && (
        <details open={status?.state === "missing-cli"}>
          <summary>Install Codex</summary>
          <p>
            Install the official Codex CLI, then choose “Check existing
            connection”. If you use npm, run{" "}
            <code>npm install -g @openai/codex</code> in your terminal.
          </p>
          <a
            href="https://developers.openai.com/codex/cli"
            target="_blank"
            rel="noreferrer"
          >
            Installation instructions <ExternalLink size={14} />
          </a>
        </details>
      )}
      {status?.ok && (
        <details>
          <summary>Try a small Luna request</summary>
          <p className="fine-print">
            Checks whether Luna can answer, using a short built-in prompt and
            your subscription allowance. Your notes are not included.
          </p>
          <InkButton
            className="button"
            disabled={!!busy}
            onClick={() => void act("probe")}
          >
            {busy === "probe" ? "Waiting for Luna…" : "Try Luna"}
          </InkButton>
          {probe && <p role="status">{probe}</p>}
        </details>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FirstRunSetup({
  initial,
  onComplete,
}: {
  initial: CodexOnboardingStatus;
  onComplete: () => void;
}) {
  const [connection, setConnection] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main id="main" className="ai-setup-page">
      <div className="ai-setup-sheet">
        <div className="ai-setup-brand">
          <BookOpen size={27} /> LMBook.
        </div>
        <h1>Welcome to LMBook.</h1>
        <p className="ai-setup-intro">
          Bring your sources. Ask questions, make flashcards, and build
          explanations you can return to. First, connect your OpenAI account so
          LMBook can help with the thinking.
        </p>
        <section className="ai-setup-step" aria-labelledby="codex-first-title">
          <h2 id="codex-first-title">Connect Codex</h2>
          <CodexSetup initial={initial} onVerified={setConnection} />
        </section>
        <div className="ai-setup-footer">
          <InkButton
            className="button primary"
            disabled={busy || !connection.ok}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await aiApi("/onboarding/complete", "POST");
                onComplete();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
            Open my library
          </InkButton>
          <p className="fine-print">
            Uses your existing subscription allowance. Optional local models and
            OpenRouter can be set up later in Connections & settings.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
