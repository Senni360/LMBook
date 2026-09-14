import { createHash } from "node:crypto";
import type { Source } from "../shared/model.ts";
import { transcriptText } from "../shared/transcription.ts";

/** Correct one passage without changing the timing or model provenance. */
export function correctTranscriptSegment(
  source: Source,
  index: number,
  text: string,
  expectedText: string,
): boolean {
  const transcript = source.transcript;
  const segment = transcript?.segments[index];
  if (!transcript || !segment)
    throw Object.assign(
      new Error("This transcript passage is no longer available."),
      { status: 404 },
    );
  if (segment.text !== expectedText)
    throw Object.assign(
      new Error(
        "This passage changed while you were editing. Reopen it to review the current transcript before saving.",
      ),
      { status: 409 },
    );
  if (text === segment.text) return false;

  const corrected = {
    ...segment,
    text,
    originalText: segment.originalText ?? segment.text,
    editedAt: new Date().toISOString(),
  };
  // Word timings describe the machine's original text. A corrected passage
  // continues to cite its segment start, without claiming new word alignment.
  delete corrected.words;
  const segments = transcript.segments.slice();
  segments[index] = corrected;
  const updated = { ...transcript, segments };
  const extracted = transcriptText(updated);
  if (extracted.length > 1_000_000)
    throw new Error(
      "The corrected transcript exceeds the source text limit. Keep this passage shorter.",
    );
  source.transcript = updated;
  source.text = extracted;
  source.extractedSha256 = createHash("sha256").update(extracted).digest("hex");
  source.extraction = `Local faster-whisper ${transcript.model}; ${transcript.language}; timestamped transcript with manual corrections`;
  return true;
}
