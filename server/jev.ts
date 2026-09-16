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
import {
  defaultJevFeatures,
  jevChoiceQuestionSchema,
  jevEvaluateResponseSchema,
  jevEvaluateRequestSchema,
  jevFeaturesSchema,
  type JevEvaluateRequest,
  type JevEvaluateResponse,
  type JevDecision,
  type JevConnectionStatus,
  type JevChoiceConsistency,
} from "../shared/jev.ts";

const credentialFile = path.join(dataDir, "jev-credentials.json");
const featureFile = path.join(dataDir, "jev-features.json");
const apiUrl = "https://api.typesafe.ai/v1/systemone";
const keySchema = z
  .string()
  .trim()
  .min(10)
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "Enter a valid TypeSafe API key without spaces.");
let credentialRevision = 0;

function savedKey() {
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
export function jevKey() {
  return savedKey() || process.env.TYPESAFE_API_KEY?.trim() || "";
}
export function jevConnectionStatus(): JevConnectionStatus {
  if (savedKey()) return { configured: true, source: "saved" };
  if (process.env.TYPESAFE_API_KEY?.trim())
    return { configured: true, source: "environment" };
  return { configured: false, source: "none" };
}
export function saveJevKey(apiKey: string) {
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

export function getJevFeatures() {
  if (!existsSync(featureFile)) return { ...defaultJevFeatures };
  try {
    return jevFeaturesSchema.parse(
      JSON.parse(readFileSync(featureFile, "utf8")),
    );
  } catch {
    return { ...defaultJevFeatures };
  }
}
export const jevSettings = getJevFeatures;
export function jevAvailable() {
  return Boolean(jevKey());
}
export function saveJevFeatures(input: unknown) {
  const value = jevFeaturesSchema.parse(input);
  const temporary = `${featureFile}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, featureFile);
  } finally {
    rmSync(temporary, { force: true });
  }
  return value;
}

function boundedState(value: unknown) {
  const text = JSON.stringify(value);
  if (text === undefined || text.length > 120_000)
    throw new Error("Jev state must be JSON and at most 120,000 characters.");
  return value;
}
function boundedRequest(request: JevEvaluateRequest) {
  jevEvaluateRequestSchema.parse(request);
  boundedState(request.state);
  for (const question of Object.values(request.questions)) {
    jevChoiceQuestionSchema.parse(question);
    const options = Object.keys(question.criteria);
    if (options.length < 2 || options.length > 255)
      throw new Error(
        "Jev Choice questions require between 2 and 255 options.",
      );
  }
}
async function responseJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("TypeSafe returned an empty response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new Error("TypeSafe returned an oversized response.");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("TypeSafe returned invalid JSON.");
  }
}
async function requestJev(
  body: JevEvaluateRequest,
  signal?: AbortSignal,
  candidateKey?: string,
) {
  const key = candidateKey || jevKey();
  if (!key)
    throw new Error("Connect TypeSafe Jev in Settings before using it.");
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message =
        response.status === 401
          ? "Check your TypeSafe API key."
          : response.status === 429 || response.status === 529
            ? "TypeSafe is busy or rate limited. Retry later."
            : response.status === 422
              ? "TypeSafe rejected the typed question or state."
              : `TypeSafe returned HTTP ${response.status}.`;
      throw new Error(message);
    }
    return response;
  } catch (error) {
    if (
      error instanceof Error &&
      (/TypeSafe (returned|is busy|rejected)/.test(error.message) ||
        error.message.startsWith("Check your TypeSafe"))
    )
      throw new Error(error.message.replaceAll(key, "[redacted]"));
    if (signal?.aborted) throw error;
    throw new Error(
      "TypeSafe could not be reached or timed out. Check your connection and retry.",
    );
  }
}

export async function evaluateJev(
  request: JevEvaluateRequest,
  signal?: AbortSignal,
): Promise<JevEvaluateResponse> {
  boundedRequest(request);
  const result = jevEvaluateResponseSchema.safeParse(
    await responseJson(await requestJev(request, signal)),
  );
  if (!result.success)
    throw new Error("TypeSafe returned an unexpected typed response.");
  const ids = Object.keys(request.questions);
  if (
    Object.keys(result.data.answers).length !== ids.length ||
    ids.some((id) => !result.data.answers[id])
  )
    throw new Error("TypeSafe returned an incomplete typed response.");
  for (const [id, answer] of Object.entries(result.data.answers)) {
    const question = request.questions[id];
    const requestedLabels = Object.keys(question?.criteria || {});
    const returnedLabels = Object.keys(answer.probabilities);
    if (
      !question ||
      answer.choice in question.criteria === false ||
      returnedLabels.some((key) => !(key in question.criteria)) ||
      returnedLabels.length !== requestedLabels.length ||
      requestedLabels.some((key) => !(key in answer.probabilities))
    )
      throw new Error(
        "TypeSafe returned an answer outside the requested Choice criteria.",
      );
    const total = Object.values(answer.probabilities).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (Math.abs(total - 1) > 0.02)
      throw new Error("TypeSafe returned an invalid probability distribution.");
  }
  return result.data;
}
export async function decideWithJev(
  request: JevEvaluateRequest,
  signal?: AbortSignal,
): Promise<JevDecision> {
  const result = await evaluateJev(request, signal);
  return {
    model: result.model,
    usage: result.usage,
    choices: Object.fromEntries(
      Object.entries(result.answers).map(([id, answer]) => [
        id,
        {
          choice: answer.choice,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
          consistency: choiceConsistency(answer.choice, answer.probabilities),
        },
      ]),
    ),
  };
}

function choiceConsistency(
  providerChoice: string,
  probabilities: Record<string, number>,
): JevChoiceConsistency {
  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const argmaxChoice = ranked[0]?.[0] || providerChoice;
  const chosenProbability = probabilities[providerChoice] ?? 0;
  const maximumProbability = ranked[0]?.[1] || 0;
  const probabilityGap = Math.max(
    0,
    (ranked[0]?.[1] || 0) - (ranked[1]?.[1] || 0),
  );
  return {
    argmaxChoice,
    // Several labels may share the maximum; any tied maximum is consistent.
    matchesArgmax: chosenProbability >= maximumProbability - 1e-9,
    probabilityGap,
    ...(chosenProbability >= maximumProbability - 1e-9
      ? {}
      : { warning: "provider-choice-differs-from-argmax" as const }),
  };
}

const authoredCheck: JevEvaluateRequest = {
  state: "LMBook connection check",
  model: "jev-latest",
  questions: {
    ready: {
      type: "choice",
      instructions: "Choose the only option that exactly describes this check.",
      criteria: {
        connection_check: "The connection check is being evaluated.",
        other: "Anything else.",
      },
    },
  },
};
export async function checkJevConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!jevKey())
    return { ok: false, message: "Save a TypeSafe API key first." };
  try {
    await evaluateJev(authoredCheck);
    return {
      ok: true,
      message:
        "TypeSafe authentication and Jev answered. No notebook data was sent.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "TypeSafe connection check failed.",
    };
  }
}
export async function connectJev(apiKey: string) {
  const key = keySchema.parse(apiKey);
  const revision = ++credentialRevision;
  try {
    const response = await requestJev(authoredCheck, undefined, key);
    const result = jevEvaluateResponseSchema.safeParse(
      await responseJson(response),
    );
    if (
      !result.success ||
      result.data.answers.ready?.choice !== "connection_check"
    )
      throw new Error(
        "TypeSafe returned an unexpected connection-check response.",
      );
    if (revision !== credentialRevision)
      return {
        ok: false,
        message:
          "The connection changed while checking this key. The newer choice was kept.",
      };
    saveJevKey(key);
    return {
      ok: true,
      message: "TypeSafe connected. No notebook data was sent.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "TypeSafe connection failed.",
    };
  }
}
