import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Settings } from "../shared/model.ts";
import type { CartesiaVoicePage } from "../shared/speech.ts";
import { dataDir } from "./store.ts";
import { readWav } from "./core.ts";

const credentialFile = path.join(dataDir, "cartesia-credentials.json");
const apiVersion = "2026-08-14";
export const cartesiaKeySchema = z
  .string()
  .trim()
  .min(10)
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "Enter a valid Cartesia API key without spaces.");

// Host-only credentials: never part of settings, status responses, or exports.
export function cartesiaKey() {
  if (!existsSync(credentialFile))
    return process.env.CARTESIA_API_KEY?.trim() || "";
  try {
    const stored = JSON.parse(readFileSync(credentialFile, "utf8"));
    return typeof stored.apiKey === "string" ? stored.apiKey : "";
  } catch {
    return "";
  }
}
export function saveCartesiaKey(apiKey: string) {
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

async function requestCartesia(
  endpoint: string,
  init: RequestInit,
  key = cartesiaKey(),
) {
  if (!key)
    throw new Error("Connect Cartesia in Settings before creating audio.");
  let response: Response;
  try {
    response = await fetch(`https://api.cartesia.ai${endpoint}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(180000)])
        : AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Cartesia-Version": apiVersion,
        "Content-Type": "application/json",
      },
      redirect: "error",
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new Error(
      "Cartesia could not be reached or timed out. Check your connection and retry; completed segments are saved.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    const explanation =
      response.status === 401 || response.status === 403
        ? "Check your API key and its voice/speech permissions in Settings."
        : response.status === 402
          ? "Check your Cartesia credit balance and billing."
          : response.status === 429
            ? "Your rate or usage limit was reached. Check your allowance, then retry."
            : response.status === 400 || response.status === 404
              ? "Check that the selected voices are available to your account and support this language."
              : "The service could not complete this request. Retry to continue from saved segments.";
    throw new Error(`Cartesia returned ${response.status}. ${explanation}`);
  }
  return response;
}

const voicesResponse = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      description: z.string().nullish(),
      tagline: z.string().nullish(),
      language: z.string().nullish(),
    }),
  ),
  has_more: z.boolean(),
  next_page: z.string().nullish(),
});
export async function listCartesiaVoices(
  options: { language?: string; query?: string; cursor?: string } = {},
  key?: string,
): Promise<CartesiaVoicePage> {
  const query = new URLSearchParams({ limit: "100" });
  if (options.language) query.set("language", options.language);
  if (options.query) query.set("q", options.query);
  if (options.cursor) query.set("starting_after", options.cursor);
  const response = await requestCartesia(`/voices?${query}`, {}, key);
  const parsed = voicesResponse.safeParse(await response.json());
  if (!parsed.success)
    throw new Error(
      "Cartesia returned an unexpected voice list. Try refreshing the voices.",
    );
  return {
    voices: parsed.data.data.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description || v.tagline || "",
      language: v.language || "",
    })),
    nextPage: parsed.data.has_more
      ? parsed.data.next_page || parsed.data.data.at(-1)?.id || null
      : null,
  };
}

export async function synthesizeCartesia(
  text: string,
  settings: Settings,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const match = /^([AB]):\s*([\s\S]+)$/.exec(text);
  if (!match)
    throw new Error("A Cartesia speech segment must belong to one host.");
  const voice =
    match[1] === "A" ? settings.cartesiaVoiceA : settings.cartesiaVoiceB;
  if (!voice)
    throw new Error("Choose both Cartesia voices in the audio studio first.");
  const sampleRate = settings.cartesiaSampleRate ?? 44100;
  const response = await requestCartesia("/tts/bytes", {
    method: "POST",
    signal: signal || AbortSignal.timeout(180000),
    body: JSON.stringify({
      model_id: settings.cartesiaModel || "sonic-3.6",
      transcript: match[2],
      voice,
      language: settings.language,
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: sampleRate,
      },
      generation_config: { speed: settings.cartesiaSpeed ?? 1 },
    }),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return finalizeCartesiaWav(buffer, sampleRate);
}

/** Cartesia streams WAV headers with unknown lengths. Finalize only those markers after HTTP completes. */
export function finalizeCartesiaWav(
  input: Buffer,
  sampleRate: 24000 | 44100 = 44100,
) {
  const buffer = Buffer.from(input);
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE" &&
    buffer.readUInt32LE(4) === 0xffffffff
  ) {
    for (let offset = 12; offset + 8 <= buffer.length;) {
      const tag = buffer.toString("ascii", offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      if (tag === "data" && size === 0xffffffff) {
        const pcmLength = buffer.length - offset - 8;
        if (!pcmLength || pcmLength % 2)
          throw new Error(
            "Cartesia returned incomplete PCM audio. Retry this segment.",
          );
        buffer.writeUInt32LE(pcmLength, offset + 4);
        break;
      }
      if (offset + 8 + size > buffer.length)
        throw new Error(
          "Cartesia returned incomplete WAV audio. Retry this segment.",
        );
      offset += 8 + size + (size % 2);
    }
    buffer.writeUInt32LE(buffer.length - 8, 4);
  }
  const { format, pcm } = readWav(buffer);
  if (
    format.readUInt16LE(2) !== 1 ||
    format.readUInt32LE(4) !== sampleRate ||
    format.readUInt16LE(14) !== 16 ||
    pcm.length % 2
  )
    throw new Error(
      `Cartesia returned an unexpected audio format. Expected mono ${sampleRate / 1000} kHz PCM16.`,
    );
  return buffer;
}
