import { useState } from "react";
import { Check, LoaderCircle, Unplug, ExternalLink } from "lucide-react";
import "./cartesia.css";

export function CartesiaSetup({
  configured,
  disabled,
  connect,
  disconnect,
  check,
}: {
  configured: boolean;
  disabled: boolean;
  connect: (key: string) => Promise<{ message: string }>;
  disconnect: () => Promise<void>;
  check: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    error?: boolean;
    text: string;
  } | null>(null);
  async function perform(task: () => Promise<void>) {
    setPending(true);
    setFeedback(null);
    try {
      await task();
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="cartesia-setup">
      <div className="connection-list">
        <div>
          <span>Cartesia · Sonic 3.6</span>
          <span className={`badge ${configured ? "covered" : "unmapped"}`}>
            {configured ? "Key saved" : "Not connected"}
          </span>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            const result = await connect(key.trim());
            setKey("");
            setFeedback({ text: result.message });
          });
        }}
      >
        <label className="field" htmlFor="cartesia-api-key">
          <span>{configured ? "Replace API key" : "Cartesia API key"}</span>
          <input
            id="cartesia-api-key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={512}
            disabled={disabled || pending}
            placeholder={
              configured
                ? "Enter a new key to replace the saved one"
                : "Paste your API key"
            }
            aria-describedby="cartesia-key-help"
          />
        </label>
        <p className="fine-print" id="cartesia-key-help">
          Saved on this computer, outside notebook backups. The saved key is
          never sent back to the page.
        </p>
        <div className="cartesia-actions">
          <button
            className="button primary"
            type="submit"
            disabled={disabled || pending || !key.trim()}
          >
            {pending ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            <span>
              {pending
                ? "Checking connection…"
                : configured
                  ? "Replace key & connect"
                  : "Connect Cartesia"}
            </span>
          </button>
          {configured && (
            <>
              <button
                className="button"
                type="button"
                disabled={disabled || pending}
                onClick={() =>
                  void perform(async () => {
                    await check();
                    setFeedback({
                      text: "Voice access works. Preview an episode to check audio generation; this check used no speech credits.",
                    });
                  })
                }
              >
                Check connection
              </button>
              <button
                className="button quiet"
                type="button"
                disabled={disabled || pending}
                onClick={() =>
                  void perform(async () => {
                    await disconnect();
                    setFeedback({
                      text: "Cartesia disconnected. Your saved episodes and audio remain available.",
                    });
                  })
                }
              >
                <Unplug size={16} />
                <span>Disconnect</span>
              </button>
            </>
          )}
        </div>
      </form>
      {feedback && (
        <p
          className={feedback.error ? "inline-error" : "cartesia-feedback"}
          role={feedback.error ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      )}
      <p className="fine-print">
        Connecting checks voice access without generating audio. Previews and
        episodes use your Cartesia credits, at approximately one credit per text
        character.
      </p>
      <a
        className="cartesia-link"
        href="https://play.cartesia.ai/keys"
        target="_blank"
        rel="noreferrer"
      >
        Manage Cartesia keys <ExternalLink size={14} />
      </a>
    </div>
  );
}
