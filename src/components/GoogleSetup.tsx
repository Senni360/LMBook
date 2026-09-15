import { InkInput, InkButton } from "./InkControl";
import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cloud,
  Copy,
  ExternalLink,
  Terminal,
} from "lucide-react";
import "./google-setup.css";

export type GoogleSetupProps = {
  configuredProject: string;
  saveProject: (projectId: string) => Promise<void>;
  checkConnection: () => Promise<{ ok: boolean; message: string }>;
};

type Step = 1 | 2 | 3 | 4;
type ConnectionState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const projectIdPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const loginCommand = "gcloud auth application-default login";

function StepLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="google-setup-link"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

function CommandRow({
  command,
  copied,
  feedback,
  onCopy,
}: {
  command: string;
  copied: boolean;
  feedback?: { kind: "success" | "error"; message: string };
  onCopy: () => void;
}) {
  return (
    <div className="google-setup-command-row">
      <code>{command}</code>
      <InkButton
        type="button"
        className="google-setup-copy"
        onClick={onCopy}
        aria-label={`Copy command: ${command}`}
        title="Copy command"
      >
        {copied ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
        <span>{copied ? "Copied" : "Copy"}</span>
      </InkButton>
      {feedback && (
        <span
          className={`google-setup-copy-feedback is-${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.message}
        </span>
      )}
    </div>
  );
}

export function GoogleSetup({
  configuredProject,
  saveProject,
  checkConnection,
}: GoogleSetupProps) {
  const [openStep, setOpenStep] = useState<Step | null>(
    configuredProject ? 4 : 1,
  );
  const [projectId, setProjectId] = useState(configuredProject);
  const [savedProject, setSavedProject] = useState(configuredProject);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [connection, setConnection] = useState<ConnectionState>({
    kind: "idle",
  });
  const [formError, setFormError] = useState("");
  const [copiedCommand, setCopiedCommand] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<{
    command: string;
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setProjectId(configuredProject);
    setSavedProject(configuredProject);
  }, [configuredProject]);

  const normalizedProject = projectId.trim();
  const projectSaved =
    normalizedProject.length > 0 && normalizedProject === savedProject;
  const quotaProjectId = projectIdPattern.test(normalizedProject)
    ? normalizedProject
    : projectIdPattern.test(savedProject.trim())
      ? savedProject.trim()
      : "YOUR_PROJECT_ID";
  const quotaCommand = `gcloud auth application-default set-quota-project ${quotaProjectId}`;

  const copyCommand = async (command: string) => {
    try {
      if (window.sennibookDesktop)
        await window.sennibookDesktop.copyText(command);
      else await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setCopyFeedback({
        command,
        kind: "success",
        message: "Copied to clipboard.",
      });
      window.setTimeout(() => setCopiedCommand(""), 1800);
    } catch {
      setCopiedCommand("");
      setCopyFeedback({
        command,
        kind: "error",
        message:
          "Copy is unavailable here. Select the command and copy it manually.",
      });
    }
  };

  const save = async () => {
    setFormError("");
    setConnection({ kind: "idle" });
    if (!projectIdPattern.test(normalizedProject)) {
      setFormError(
        "Use the Google Cloud project ID: 6–30 lowercase letters, numbers or hyphens; start with a letter and end with a letter or number.",
      );
      return;
    }
    setSaveState("saving");
    try {
      await saveProject(normalizedProject);
      setSavedProject(normalizedProject);
      setOpenStep(4);
    } catch (error) {
      setFormError(
        (error as Error).message || "The project ID could not be saved.",
      );
    } finally {
      setSaveState("idle");
    }
  };

  const verify = async () => {
    setFormError("");
    setConnection({ kind: "idle" });
    if (!projectSaved) {
      setFormError(
        "Save this project ID first, then check the local credentials.",
      );
      return;
    }
    setConnection({ kind: "checking" });
    try {
      const result = await checkConnection();
      setConnection(
        result.ok
          ? { kind: "success", message: result.message }
          : { kind: "error", message: result.message },
      );
    } catch (error) {
      setConnection({
        kind: "error",
        message:
          (error as Error).message || "The connection check could not finish.",
      });
    }
  };

  const renderStep = (step: Step, title: string, content: ReactNode) => {
    const isOpen = openStep === step;
    return (
      <section className={`google-setup-step ${isOpen ? "is-open" : ""}`}>
        <InkButton
          type="button"
          className="google-setup-step-toggle"
          aria-expanded={isOpen}
          onClick={() => setOpenStep(isOpen ? null : step)}
        >
          <span className="google-setup-step-number" aria-hidden="true">
            {step}
          </span>
          <span className="google-setup-step-title">{title}</span>
          <span className="google-setup-step-status">
            {step === 4 && projectSaved
              ? "Saved"
              : step === 4
                ? "Next"
                : "Manual"}
          </span>
          {isOpen ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronRight size={18} aria-hidden="true" />
          )}
        </InkButton>
        {isOpen && <div className="google-setup-step-body">{content}</div>}
      </section>
    );
  };

  return (
    <div className="google-setup">
      <div className="google-setup-intro">
        <div className="google-setup-intro-mark" aria-hidden="true">
          <Cloud size={21} />
        </div>
        <div>
          <h3>Set up Google Cloud speech</h3>
          <p>
            Set up Google Cloud once for two-speaker audio. LMBook keeps your
            credentials on this computer and lets you check authentication
            before trying a preview.
          </p>
        </div>
      </div>

      <div className="google-setup-status" aria-live="polite">
        <span
          className={`google-setup-status-dot ${projectSaved ? "is-saved" : ""}`}
        />
        <span>
          {projectSaved ? (
            <>
              Project saved: <code>{savedProject}</code>
            </>
          ) : (
            "No Google Cloud project saved yet"
          )}
        </span>
      </div>

      <div className="google-setup-steps">
        {renderStep(
          1,
          "Check your eligible Cloud credit",
          <>
            <p>
              If you have Google AI Pro, open My benefits and see whether a
              Cloud credit is available for your account. Eligibility and the
              amount are decided by Google; LMBook cannot check them.
            </p>
            <div className="google-setup-actions">
              <StepLink href="https://developers.google.com/profile/help/benefits">
                Open Google Developer Program benefits
              </StepLink>
            </div>
            <p className="google-setup-manual-note">
              Manual step · review billing and credit terms in your Google
              account.
            </p>
          </>,
        )}

        {renderStep(
          2,
          "Choose a project, link billing, enable Text-to-Speech",
          <>
            <p>
              Select an existing Google Cloud project or create one. Link a
              billing account, then enable Cloud Text-to-Speech for that
              project.
            </p>
            <div className="google-setup-actions">
              <StepLink href="https://console.cloud.google.com/cloud-resource-manager">
                Open project selector
              </StepLink>
              <StepLink href="https://console.cloud.google.com/apis/library/texttospeech.googleapis.com">
                Enable Text-to-Speech API
              </StepLink>
              <StepLink href="https://docs.cloud.google.com/text-to-speech/docs/gemini-tts">
                Read Google’s Gemini TTS setup
              </StepLink>
            </div>
            <p className="google-setup-manual-note">
              Manual step · billing must be enabled. Google says Gemini TTS also
              needs the Vertex AI User permission
              (`aiplatform.endpoints.predict`).
            </p>
          </>,
        )}

        {renderStep(
          3,
          "Install gcloud and create local credentials",
          <>
            <p>
              Install the Google Cloud CLI, then run these commands in a
              terminal. A browser window will open for Google sign-in.
            </p>
            <div className="google-setup-actions">
              <StepLink href="https://cloud.google.com/sdk/docs/install">
                Install Google Cloud CLI
              </StepLink>
              <StepLink href="https://docs.cloud.google.com/docs/authentication/provide-credentials-adc">
                Read about ADC credentials
              </StepLink>
            </div>
            <div
              className="google-setup-commands"
              aria-label="Google Cloud commands"
            >
              <div className="google-setup-command-label">
                <Terminal size={15} aria-hidden="true" />
                Sign in for local API access
              </div>
              <CommandRow
                command={loginCommand}
                copied={copiedCommand === loginCommand}
                feedback={
                  copyFeedback?.command === loginCommand
                    ? copyFeedback
                    : undefined
                }
                onCopy={() => void copyCommand(loginCommand)}
              />
              <CommandRow
                command={quotaCommand}
                copied={copiedCommand === quotaCommand}
                feedback={
                  copyFeedback?.command === quotaCommand
                    ? copyFeedback
                    : undefined
                }
                onCopy={() => void copyCommand(quotaCommand)}
              />
            </div>
            <p className="google-setup-manual-note">
              Run the quota command after login. If it shows{" "}
              <code>YOUR_PROJECT_ID</code>, replace it with your project ID.
              Your account needs permission to use that project for quota and
              billing.
            </p>
          </>,
        )}

        {renderStep(
          4,
          "Save the project here, then verify",
          <>
            <p>
              Save the project ID in LMBook. The connection check verifies local
              authentication only; it does not verify billing, credit
              eligibility, or voice quality. Try a short preview before a long
              episode.
            </p>
            <div className="google-setup-project-form">
              <label htmlFor="google-project-id">Google Cloud project ID</label>
              <div className="google-setup-project-row">
                <InkInput
                  id="google-project-id"
                  value={projectId}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setFormError("");
                    setConnection({ kind: "idle" });
                  }}
                  placeholder="my-study-project"
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  aria-describedby="google-project-help"
                />
                <InkButton
                  type="button"
                  className="google-setup-button google-setup-button-primary"
                  onClick={() => void save()}
                  disabled={saveState === "saving"}
                >
                  {saveState === "saving" ? "Saving…" : "Save project"}
                </InkButton>
              </div>
              <p id="google-project-help" className="google-setup-field-help">
                Use the project ID, not the display name or project number.
              </p>
              {formError && (
                <p className="google-setup-error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {formError}
                </p>
              )}
            </div>
            <div className="google-setup-verify-row">
              <InkButton
                type="button"
                className="google-setup-button"
                onClick={() => void verify()}
                disabled={!projectSaved || connection.kind === "checking"}
              >
                {connection.kind === "checking"
                  ? "Checking…"
                  : "Check connection"}
              </InkButton>
              {connection.kind === "success" && (
                <p className="google-setup-success" role="status">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  {connection.message}
                </p>
              )}
              {connection.kind === "error" && (
                <p className="google-setup-error" role="alert">
                  <CircleAlert size={15} aria-hidden="true" />
                  {connection.message}
                </p>
              )}
            </div>
          </>,
        )}
      </div>
    </div>
  );
}
