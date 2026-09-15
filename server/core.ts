import {
  type Evidence,
  type Notebook,
  type Turn,
  words,
} from "../shared/model.ts";
import { createHash } from "node:crypto";
import type { SourceContextResult } from "./context-selection.ts";

export function parseJSON(raw: string): unknown {
  const clean = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error(
      "The model returned an invalid response. Try again or choose a model with stronger structured-output support.",
    );
  }
}
export function validEvidence(
  evidence: Evidence[],
  notebook: Notebook,
  context?: SourceContextResult,
): Evidence[] {
  const normalize = (s: string) => s.replace(/\s+/gu, " ").trim();
  const supplied = new Map<string, string[]>();
  for (const source of notebook.sources) {
    if (!context) {
      supplied.set(source.id, [normalize(source.text)]);
      continue;
    }
    const intervals = context.passages
      .filter(
        (passage) =>
          passage.sourceId === source.id &&
          passage.start >= 0 &&
          passage.end <= source.text.length &&
          passage.end > passage.start,
      )
      .map(({ start, end }) => ({ start, end }))
      .sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval.start <= previous.end)
        previous.end = Math.max(previous.end, interval.end);
      else merged.push(interval);
    }
    // Joining only contiguous ranges permits a true quote across chunk edges,
    // while keeping text omitted by retrieval outside the accepted evidence.
    supplied.set(
      source.id,
      merged.map(({ start, end }) => normalize(source.text.slice(start, end))),
    );
  }
  return evidence.filter((item) => {
    const quote = normalize(item.quote);
    return (
      quote.length >= 12 &&
      supplied.get(item.sourceId)?.some((text) => text.includes(quote))
    );
  });
}
export function speechChunks(turns: Turn[], maxBytes = 2800): string[] {
  const lines: string[] = [];
  for (const turn of turns) {
    let line = `${turn.speaker}:`;
    for (const word of turn.text.split(/\s+/u).filter(Boolean)) {
      if (Buffer.byteLength(`${turn.speaker}: ${word}`) > maxBytes)
        throw new Error(
          "A word in the script exceeds the speech request limit. Edit that passage first.",
        );
      if (Buffer.byteLength(line + " " + word) > maxBytes) {
        lines.push(line);
        line = `${turn.speaker}: ${word}`;
      } else line += " " + word;
    }
    if (line !== `${turn.speaker}:`) lines.push(line);
  }
  const result: string[] = [];
  let chunk = "";
  for (const line of lines) {
    if (chunk && Buffer.byteLength(chunk + "\n" + line) > maxBytes) {
      result.push(chunk);
      chunk = line;
    } else chunk += (chunk ? "\n" : "") + line;
  }
  if (chunk) result.push(chunk);
  return result;
}
export function readWav(buffer: Buffer): { format: Buffer; pcm: Buffer } {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new Error("Speech provider returned an unsupported audio format.");
  let format: Buffer | undefined;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const tag = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + size > buffer.length)
      throw new Error("Speech provider returned incomplete audio.");
    const bytes = buffer.subarray(offset + 8, offset + 8 + size);
    if (tag === "fmt ") format = bytes;
    if (tag === "data") pcm = bytes;
    offset += 8 + size + (size % 2);
  }
  if (
    !format ||
    format.length < 16 ||
    !pcm?.length ||
    format.readUInt16LE(0) !== 1
  )
    throw new Error("Expected PCM WAV audio from the speech provider.");
  return { format, pcm };
}
export function combineWavs(buffers: Buffer[]) {
  if (!buffers.length) throw new Error("No audio was generated.");
  const parts = buffers.map(readWav);
  const fmt = parts[0].format;
  if (parts.some((p) => !p.format.equals(fmt)))
    throw new Error("Speech segments have incompatible audio formats.");
  const pcmLength = parts.reduce((length, part) => length + part.pcm.length, 0);
  const header = Buffer.alloc(28 + fmt.length);
  header.write("RIFF", 0);
  header.writeUInt32LE(header.length + pcmLength - 8, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(fmt.length, 16);
  fmt.copy(header, 20);
  header.write("data", 20 + fmt.length);
  header.writeUInt32LE(pcmLength, 24 + fmt.length);
  return {
    buffer: Buffer.concat([header, ...parts.map((part) => part.pcm)]),
    seconds: pcmLength / fmt.readUInt32LE(8),
  };
}
export function exportMarkdown(n: Notebook) {
  const source = (s: Notebook["sources"][number], level = "###") =>
    `${level} ${s.title}\n\nType: ${s.kind}\nSource ID: ${s.id}\nText SHA-256: ${s.extractedSha256 || createHash("sha256").update(s.text).digest("hex")}${s.originalSha256 ? `\nOriginal file SHA-256: ${s.originalSha256}` : ""}${s.extraction ? `\nExtraction: ${s.extraction}` : ""}\n\n${s.text}`;
  const objectives = (items: Notebook["objectives"]) =>
    items
      .map(
        (o) =>
          `- [ ] ${o.text} (${o.kind}; ID: ${o.id}${o.important ? "; important" : ""})`,
      )
      .join("\n");
  const episodes = n.episodes
    .map((e) => {
      const sources = e.sources || n.sources;
      const goals = e.objectives || n.objectives;
      const chapters = e.chapters
        .map(
          (c) =>
            `#### ${c.title}\n\n${c.summary}\n\nLearning goals: ${c.objectiveIds.map((id) => goals.find((o) => o.id === id)?.text || id).join("; ")}\n\n${c.turns.map((t) => `**Host ${t.speaker}:** ${t.text}${t.sourceIds.length ? `\n\nSources: ${t.sourceIds.map((id) => `${sources.find((s) => s.id === id)?.title || id} [${id}]`).join("; ")}` : ""}`).join("\n\n")}`,
        )
        .join("\n\n");
      return `### ${e.title}\n\nEpisode ID: ${e.id}\nCreated: ${e.createdAt}\nLanguage: ${e.settings.language}\nDepth: ${e.settings.depth}\nTarget: ${e.settings.minutes} minutes\n\n#### Teaching instructions\n\n${e.settings.harness}\n\nAssumed knowledge: ${e.settings.assumedKnowledge || "Not specified"}\n\n${chapters}\n\n#### Episode learning goals${e.objectives ? " (saved snapshot)" : " (legacy: current notebook)"}\n\n${objectives(goals)}\n\n#### Episode sources${e.sources ? " (saved snapshot)" : " (legacy: current notebook)"}\n\n${sources.map((s) => source(s, "#####")).join("\n\n")}`;
    })
    .join("\n\n");
  return `# ${n.title}\n\n${n.description}\n\n## Learning objectives\n\n${objectives(n.objectives)}\n\n## Sources\n\n${n.sources.map((s) => source(s)).join("\n\n")}\n\n## Episodes\n\n${episodes}\n`;
}
export function scriptMinutes(turns: Turn[]) {
  return words(turns.map((t) => t.text).join(" ")) / 145;
}
