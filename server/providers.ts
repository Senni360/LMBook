import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { baseInstructions, type Settings } from "../shared/model.ts";
import { generateWithOpenCode } from "./opencode.ts";
import { googleProject } from "./preferences.ts";
import { synthesizeCartesia } from "./cartesia.ts";
import { codexCommand } from "./codex-command.ts";

import { generateWithCodex } from "./codex-app-server.ts";
import { generateWithOpenRouter } from "./openrouter.ts";

export { codexPath } from "./codex-command.ts";
export const codexAvailable = () => !!codexCommand();
export async function generate(
  settings: Settings,
  task: string,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<string> {
  signal?.throwIfAborted();
  const prompt = `${baseInstructions}\n\nSubject profile:\n${settings.harness}\nLanguage: ${settings.language === "nl" ? "Dutch" : "English"}. Depth: ${settings.depth}. Purpose: ${settings.purpose}. Assumed knowledge: ${settings.assumedKnowledge || "Not specified; do not assume mastery."}\n\n${task}`;
  if (settings.provider === "codex")
    return generateWithCodex(prompt, settings.model, signal, onProgress);
  if (settings.provider === "openrouter") {
    onProgress?.("Writing through OpenRouter");
    return generateWithOpenRouter(prompt, settings.model, signal);
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
    const result = z
      .object({
        choices: z
          .tuple([
            z.object({ message: z.object({ content: z.string().min(1) }) }),
          ])
          .rest(z.unknown()),
      })
      .safeParse(await response.json());
    if (!result.success)
      throw new Error("OpenCode returned an empty response.");
    return result.data.choices[0].message.content;
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
  const result = z
    .object({ message: z.object({ content: z.string().min(1) }) })
    .safeParse(await response.json());
  if (!result.success) throw new Error("Ollama returned an empty response.");
  return result.data.message.content;
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
    const result = z
      .object({ error: z.object({ message: z.string().min(1) }) })
      .safeParse(await response.json().catch(() => null));
    throw new Error(
      `Google speech returned ${response.status}: ${(result.success ? result.data.error.message : "Check Cloud billing, API access and credentials.").slice(0, 400)}`,
    );
  }
  const result = z
    .object({ audioContent: z.string().min(1) })
    .safeParse(await response.json());
  if (!result.success) throw new Error("Google returned no audio.");
  return Buffer.from(result.data.audioContent, "base64");
}
