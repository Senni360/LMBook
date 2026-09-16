import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "./store.ts";

/**
 * Small, host-only OpenRouter adapter.  The router is deliberately limited to
 * model discovery, embeddings and bounded non-streaming chat completions.
 * Luna continues to use Codex App Server; this adapter must not be used for it.
 */
const credentialFile = path.join(dataDir, "openrouter-credentials.json");
const apiBase = "https://openrouter.ai/api/v1";
let credentialRevision = 0;

export const openRouterKeySchema = z
  .string()
  .trim()
  .min(10)
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "Enter a valid OpenRouter API key without spaces.");

export type OpenRouterModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number | null;
  inputModalities: string[];
  outputModalities: string[];
  promptPricePerToken: string | null;
  completionPricePerToken: string | null;
};

export type OpenRouterConnectionStatus = {
  configured: boolean;
  source: "saved" | "environment" | "none";
};

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterChatOptions = {
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type OpenRouterEmbeddingOptions = {
  model: string;
  input: string | string[];
  signal?: AbortSignal;
};

function savedKey(): string {
  if (!existsSync(credentialFile)) return "";
  try {
    const value: unknown = JSON.parse(readFileSync(credentialFile, "utf8"));
    return typeof value === "object" &&
      value !== null &&
      typeof (value as { apiKey?: unknown }).apiKey === "string"
      ? (value as { apiKey: string }).apiKey
      : "";
  } catch {
    return "";
  }
}

/** Returns a secret only to server-side callers; never include it in a response. */
export function openRouterKey(): string {
  return savedKey() || process.env.OPENROUTER_API_KEY?.trim() || "";
}

export function openRouterConnectionStatus(): OpenRouterConnectionStatus {
  if (savedKey()) return { configured: true, source: "saved" };
  if (process.env.OPENROUTER_API_KEY?.trim())
    return { configured: true, source: "environment" };
  return { configured: false, source: "none" };
}

export function saveOpenRouterKey(apiKey: string) {
  credentialRevision++;
  if (!apiKey) {
    rmSync(credentialFile, { force: true });
    return;
  }
  const temporary = `${credentialFile}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ apiKey }), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, credentialFile);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function boundedModel(model: string) {
  const value = model.trim();
  if (!/^[a-z0-9._:-]+\/[a-z0-9._:-]+$/i.test(value) || value.length > 200)
    throw new Error(
      "Enter a valid OpenRouter model ID (for example, provider/model).",
    );
  if (/luna/i.test(value))
    throw new Error(
      "GPT-5.6 Luna stays on the existing Codex subscription and cannot use OpenRouter.",
    );
  return value;
}

async function requestOpenRouter(
  endpoint:
    | "/key"
    | "/models"
    | "/embeddings/models"
    | "/chat/completions"
    | "/embeddings",
  init: RequestInit = {},
  candidateKey?: string,
) {
  const key = candidateKey || openRouterKey();
  if (!key)
    throw new Error(
      "Connect OpenRouter in Settings before using hosted models.",
    );
  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      ...init,
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      const explanation =
        response.status === 401 || response.status === 403
          ? "Check your OpenRouter API key and permissions."
          : response.status === 402
            ? "OpenRouter requires available credits for this request."
            : response.status === 429
              ? "OpenRouter rate or usage limit reached. Retry later."
              : `OpenRouter returned HTTP ${response.status}.`;
      throw new Error(explanation);
    }
    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      (/OpenRouter (returned|requires|rate|could)/.test(error.message) ||
        error.message.startsWith("Check your OpenRouter"))
    )
      throw error;
    if (init.signal?.aborted) throw error;
    throw new Error(
      "OpenRouter could not be reached or timed out. Check your connection and retry.",
    );
  }
}

async function responseJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenRouter returned an empty response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 10_000_000) {
        await reader.cancel();
        throw new Error("OpenRouter returned an oversized response.");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("OpenRouter returned invalid JSON.");
  }
}

const modelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  context_length: z.number().nullable().optional(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional(),
      output_modalities: z.array(z.string()).optional(),
    })
    .optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
});

function mapModels(value: unknown): OpenRouterModel[] {
  const parsed = z.object({ data: z.array(modelSchema) }).safeParse(value);
  if (!parsed.success)
    throw new Error("OpenRouter returned an unexpected model list.");
  return parsed.data.data.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    description: model.description || "",
    contextLength: model.context_length ?? null,
    inputModalities: model.architecture?.input_modalities || [],
    outputModalities: model.architecture?.output_modalities || [],
    promptPricePerToken: model.pricing?.prompt ?? null,
    completionPricePerToken: model.pricing?.completion ?? null,
  }));
}

export async function checkOpenRouterConnection() {
  if (!openRouterKey())
    return { ok: false, message: "Save an OpenRouter API key first." };
  try {
    const response = await requestOpenRouter("/key");
    await responseJson(response);
    return {
      ok: true,
      message: "OpenRouter authentication works. No inference was run.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "OpenRouter connection check failed.",
    };
  }
}

/** Validate a proposed key before replacing the currently saved key. */
export async function connectOpenRouter(apiKey: string) {
  const key = openRouterKeySchema.parse(apiKey);
  const revision = ++credentialRevision;
  try {
    await responseJson(await requestOpenRouter("/key", {}, key));
    if (revision !== credentialRevision)
      return {
        ok: false,
        message:
          "The connection changed while checking this key. The newer choice was kept.",
      };
    saveOpenRouterKey(key);
    return { ok: true, message: "OpenRouter connected. No inference was run." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "OpenRouter connection failed.",
    };
  }
}

export async function listOpenRouterModels(
  options: { embeddings?: boolean } = {},
) {
  const response = await requestOpenRouter(
    options.embeddings ? "/embeddings/models" : "/models",
  );
  return mapModels(await responseJson(response));
}

/** Fetches a bounded catalogue for UI selection; credentials stay server-side. */
export async function listOpenRouterChatModels() {
  return listOpenRouterModels();
}

export async function listOpenRouterEmbeddingModels() {
  return listOpenRouterModels({ embeddings: true });
}

export async function openRouterChat(
  options: OpenRouterChatOptions,
): Promise<string> {
  const model = boundedModel(options.model);
  if (!options.messages.length || options.messages.length > 64)
    throw new Error("OpenRouter chat requires between 1 and 64 messages.");
  const totalCharacters = options.messages.reduce(
    (sum, message) => sum + message.content.length,
    0,
  );
  if (
    options.messages.some(
      (message) => !message.content || message.content.length > 120_000,
    ) ||
    totalCharacters > 120_000
  )
    throw new Error(
      "OpenRouter chat messages must be non-empty and at most 120,000 characters total.",
    );
  const maxTokens = Math.min(
    Math.max(Math.floor(options.maxTokens ?? 4000), 1),
    16_000,
  );
  const temperature =
    options.temperature === undefined
      ? undefined
      : Math.min(Math.max(options.temperature, 0), 2);
  const response = await requestOpenRouter("/chat/completions", {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages: options.messages,
      max_tokens: maxTokens,
      ...(temperature === undefined ? {} : { temperature }),
      stream: false,
    }),
  });
  const result = z
    .object({
      choices: z
        .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
        .min(1),
    })
    .safeParse(await responseJson(response));
  if (!result.success)
    throw new Error("OpenRouter returned an empty chat response.");
  return result.data.choices[0].message.content;
}

/** Provider-compatible bounded generation entry point for the existing jobs. */
export async function generateWithOpenRouter(
  prompt: string,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!prompt.trim() || prompt.length > 120_000)
    throw new Error(
      "The OpenRouter prompt must be non-empty and at most 120,000 characters.",
    );
  return openRouterChat({
    model,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 10_000,
    signal,
  });
}

export async function openRouterEmbeddings(
  options: OpenRouterEmbeddingOptions,
): Promise<number[][]> {
  const model = boundedModel(options.model);
  const input =
    typeof options.input === "string" ? [options.input] : options.input;
  const totalCharacters = input.reduce((sum, text) => sum + text.length, 0);
  if (!input.length || input.length > 64)
    throw new Error(
      "OpenRouter embeddings accept between 1 and 64 texts per request.",
    );
  if (
    input.some((text) => !text || text.length > 100_000) ||
    totalCharacters > 128_000
  )
    throw new Error(
      "Embedding texts must be non-empty, each at most 100,000 characters, and 128,000 characters total.",
    );
  const response = await requestOpenRouter("/embeddings", {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({ model, input, encoding_format: "float" }),
  });
  const result = z
    .object({
      data: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          embedding: z.array(z.number()),
        }),
      ),
    })
    .safeParse(await responseJson(response));
  if (!result.success || result.data.data.length !== input.length)
    throw new Error("OpenRouter returned an unexpected embedding response.");
  const ordered = [...result.data.data].sort((a, b) => a.index - b.index);
  if (ordered.some((item, index) => item.index !== index))
    throw new Error(
      "OpenRouter returned duplicate or missing embedding indexes.",
    );
  const dimensions = ordered[0].embedding.length;
  if (
    !dimensions ||
    ordered.some(
      (item) =>
        item.embedding.length !== dimensions ||
        item.embedding.some((value) => !Number.isFinite(value)),
    )
  )
    throw new Error("OpenRouter returned inconsistent embedding vectors.");
  if (ordered.some((item) => item.embedding.every((value) => value === 0)))
    throw new Error("OpenRouter returned an empty embedding vector.");
  return ordered.map((item) => item.embedding);
}
