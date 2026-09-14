import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import { baseInstructions, type Settings } from "../shared/model.ts";
import { generateWithOpenCode } from "./opencode.ts";
import { googleProject } from "./preferences.ts";
import { stopProcess } from "./process-lifecycle.ts";
import { synthesizeCartesia } from "./cartesia.ts";

export const codexPath =
  process.env.CODEX_CLI_PATH ||
  path.join(
    process.env.APPDATA || "",
    "npm",
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js",
  );
export const codexAvailable = () => existsSync(codexPath);
export async function generate(
  settings: Settings,
  task: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const prompt = `${baseInstructions}\n\nSubject profile:\n${settings.harness}\nLanguage: ${settings.language === "nl" ? "Dutch" : "English"}. Depth: ${settings.depth}. Purpose: ${settings.purpose}. Assumed knowledge: ${settings.assumedKnowledge || "Not specified; do not assume mastery."}\n\n${task}`;
  if (settings.provider === "codex") {
    if (!codexAvailable())
      throw new Error(
        "Codex CLI was not found. Install it and sign in, or select OpenCode Go or Ollama in Settings.",
      );
    const dir = mkdtempSync(path.join(tmpdir(), "sennibook-"));
    const output = path.join(dir, "answer.txt");
    try {
      await new Promise<void>((resolve, reject) => {
        const args = [
          codexPath,
          "exec",
          "--ignore-user-config",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          "--ephemeral",
          "--color",
          "never",
          "-o",
          output,
        ];
        if (settings.model) args.push("-m", settings.model);
        args.push("-");
        const child = spawn(
          process.env.SENNIBOOK_NODE_EXEC || process.execPath,
          args,
          {
            cwd: dir,
            windowsHide: true,
            env: {
              ...Object.fromEntries(
                Object.entries(process.env).filter(([key]) =>
                  /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|CODEX_HOME|LANG|LC_ALL)$/i.test(
                    key,
                  ),
                ),
              ),
              ...(process.env.SENNIBOOK_NODE_EXEC
                ? { ELECTRON_RUN_AS_NODE: "1" }
                : {}),
            },
            stdio: ["pipe", "ignore", "pipe"],
          },
        );
        let diagnostic = "";
        let stopReason: Error | undefined;
        const stop = (reason: Error) => {
          if (stopReason) return;
          stopReason = reason;
          stopProcess(child);
        };
        const abort = () =>
          stop(new Error("Generation cancelled. Completed work is saved."));
        child.stderr.on("data", (d) => {
          diagnostic = (diagnostic + d.toString()).slice(-500);
        });
        const timeout = setTimeout(() => {
          stop(
            new Error(
              "Codex took longer than 10 minutes. Try a smaller chapter or another model.",
            ),
          );
        }, 600000);
        const cleanup = () => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
        };
        child.on("error", (e) => {
          cleanup();
          reject(e);
        });
        child.on("close", (code) => {
          cleanup();
          if (stopReason) {
            reject(stopReason);
            return;
          }
          code === 0
            ? resolve()
            : reject(
                new Error(
                  /auth|login|401/i.test(diagnostic)
                    ? "Codex needs authentication. Run codex login in a terminal, then retry."
                    : "Codex could not complete this request. Check your CLI login and usage limits, or choose another provider.",
                ),
              );
        });
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        child.stdin.on("error", () => {});
        child.stdin.end(stopReason ? undefined : prompt);
      });
      return readFileSync(output, "utf8");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const combinedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(600000)])
    : AbortSignal.timeout(600000);
  if (settings.provider === "opencode") {
    if (!process.env.OPENCODE_API_KEY)
      return generateWithOpenCode(prompt, settings.model, signal);
    if (!settings.model)
      throw new Error(
        "Enter a chat-completions-compatible OpenCode Go model ID in Settings.",
      );
    const response = await fetch(
      "https://opencode.ai/zen/go/v1/chat/completions",
      {
        method: "POST",
        signal: combinedSignal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENCODE_API_KEY}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 10000,
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `OpenCode Go returned ${response.status}. Check the model ID, API key and available allowance.`,
      );
    const data = (await response.json()) as any;
    if (!data.choices?.[0]?.message?.content)
      throw new Error("OpenCode returned an empty response.");
    return data.choices[0].message.content;
  }
  const base = new URL(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
    throw new Error("This version only connects to Ollama on localhost.");
  const response = await fetch(new URL("/api/chat", base), {
    method: "POST",
    signal: combinedSignal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model || "qwen3:8b",
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      options: { num_ctx: 32768 },
    }),
  });
  if (!response.ok)
    throw new Error(
      `Ollama returned ${response.status}. Make sure it is running and the selected model is installed.`,
    );
  const data = (await response.json()) as any;
  if (!data.message?.content)
    throw new Error("Ollama returned an empty response.");
  return data.message.content;
}

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
export async function checkGoogleConnection() {
  if (!googleProject())
    return { ok: false, message: "Save your Google Cloud project ID first." };
  try {
    const client = await googleAuth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) throw new Error("No access token was returned.");
    return {
      ok: true,
      message:
        "Google authentication works. A short voice preview will check speech permissions and billing. This check did not generate audio.",
    };
  } catch {
    return {
      ok: false,
      message:
        "Google credentials are not ready. Run gcloud auth application-default login, set the quota project, then check again.",
    };
  }
}
export async function synthesize(
  text: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (settings.ttsProvider === "cartesia")
    return synthesizeCartesia(text, settings, signal);
  const project = googleProject();
  if (!project)
    throw new Error(
      "Set GOOGLE_CLOUD_PROJECT in .env and configure Application Default Credentials before creating audio.",
    );
  const client = await googleAuth.getClient();
  const token = await client.getAccessToken();
  if (!token.token)
    throw new Error(
      "Google authentication failed. Run gcloud auth application-default login.",
    );
  const prompt = `Perform the exact dialogue in ${settings.language === "nl" ? "natural Dutch" : "natural English"} between two informed colleagues. Keep both voices consistent. Thoughtful, engaged delivery; measured pace. Follow punctuation and emphasis. No added commentary, music or invented dialogue. Read A and B as speaker labels, not spoken text.`;
  if (Buffer.byteLength(text) + Buffer.byteLength(prompt) > 4000)
    throw new Error("Speech segment is too long.");
  const response = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(180000)])
        : AbortSignal.timeout(180000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.token}`,
        "x-goog-user-project": project,
      },
      body: JSON.stringify({
        input: { text, prompt },
        voice: {
          languageCode: settings.language === "nl" ? "nl-NL" : "en-US",
          modelName: settings.ttsModel,
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speakerAlias: "A", speakerId: settings.voiceA },
              { speakerAlias: "B", speakerId: settings.voiceB },
            ],
          },
        },
        audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 },
      }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as any;
    throw new Error(
      `Google speech returned ${response.status}: ${String(body.error?.message || "Check Cloud billing, API access and credentials.").slice(0, 400)}`,
    );
  }
  const data = (await response.json()) as any;
  if (!data.audioContent) throw new Error("Google returned no audio.");
  return Buffer.from(data.audioContent, "base64");
}
