import type { Source } from "./model.ts";
import { timestamp, transcriptText, type Transcript } from "./transcription.ts";

export type EvidenceLocation = {
  label: string;
  startSeconds?: number;
  startOffset?: number;
  endOffset?: number;
};

const whitespace = /\s/u;
const pageOrSlideMarker = /\[(Page|Slide)\s+(\d+)\]/gu;

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizedQuote(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function normalizedIndexAt(value: string, originalOffset: number): number {
  let normalizedOffset = 0;
  let index = 0;
  while (index < value.length) {
    if (whitespace.test(value[index])) {
      while (index < value.length && whitespace.test(value[index])) index++;
      if (originalOffset < index) return normalizedOffset;
      if (normalizedOffset > 0 && index < value.length) normalizedOffset++;
      continue;
    }
    if (index >= originalOffset) return normalizedOffset;
    normalizedOffset++;
    index++;
  }
  return normalizedOffset;
}

/** Map a normalized match back to UTF-16 offsets without per-character arrays. */
function originalRangeAt(
  value: string,
  normalizedStart: number,
  normalizedLength: number,
): { start: number; end: number } | undefined {
  const normalizedEnd = normalizedStart + normalizedLength;
  let normalizedOffset = 0;
  let start: number | undefined;
  let end: number | undefined;
  let index = 0;
  while (index < value.length) {
    if (whitespace.test(value[index])) {
      const runStart = index;
      while (index < value.length && whitespace.test(value[index])) index++;
      if (normalizedOffset > 0 && index < value.length) {
        if (normalizedOffset === normalizedStart) start = runStart;
        if (normalizedOffset + 1 === normalizedEnd) end = index;
        normalizedOffset++;
      }
      continue;
    }
    if (normalizedOffset === normalizedStart) start = index;
    if (normalizedOffset + 1 === normalizedEnd) {
      end = index + 1;
      return start === undefined ? undefined : { start, end };
    }
    normalizedOffset++;
    index++;
  }
  return start !== undefined && end !== undefined ? { start, end } : undefined;
}

function pageOrSlideLabel(
  sourceText: string,
  startOffset: number,
): string | undefined {
  pageOrSlideMarker.lastIndex = 0;
  let label: string | undefined;
  for (const match of sourceText.matchAll(pageOrSlideMarker)) {
    if (match.index > startOffset) break;
    label = `${match[1]} ${match[2]}`;
  }
  pageOrSlideMarker.lastIndex = 0;
  return label;
}

function transcriptSegmentIndex(
  sourceText: string,
  startOffset: number,
  transcript: Transcript,
): { index: number; start: number; end: number } | undefined {
  const canonical = transcriptText(transcript);
  if (sourceText === canonical) {
    let offset = 0;
    for (const [index, segment] of transcript.segments.entries()) {
      const marker = `[${timestamp(segment.start)} – ${timestamp(segment.end)}]`;
      const markerEnd = offset + marker.length;
      const next =
        markerEnd +
        1 +
        segment.text.trim().length +
        (index < transcript.segments.length - 1 ? 2 : 0);
      if (startOffset >= offset && startOffset < next)
        return {
          index,
          start: markerEnd,
          end:
            index < transcript.segments.length - 1 ? next : sourceText.length,
        };
      offset = next;
    }
    return undefined;
  }

  const normalizedSource = normalizedText(sourceText);
  if (normalizedSource !== normalizedText(canonical)) return undefined;
  const normalizedStart = normalizedIndexAt(sourceText, startOffset);
  let blockStart = 0;
  for (const [index, segment] of transcript.segments.entries()) {
    const marker = `[${timestamp(segment.start)} – ${timestamp(segment.end)}]`;
    const markerLength = normalizedText(marker).length;
    const blockEnd =
      blockStart +
      markerLength +
      1 +
      normalizedText(segment.text.trim()).length;
    const nextBlockStart =
      index < transcript.segments.length - 1
        ? blockEnd + 1
        : normalizedSource.length;
    if (normalizedStart >= blockStart && normalizedStart < nextBlockStart) {
      const markerRange = originalRangeAt(sourceText, blockStart, markerLength);
      if (!markerRange) return undefined;
      let end = sourceText.length;
      if (index < transcript.segments.length - 1) {
        const nextMarker = `[${timestamp(
          transcript.segments[index + 1].start,
        )} – ${timestamp(transcript.segments[index + 1].end)}]`;
        const nextRange = originalRangeAt(
          sourceText,
          nextBlockStart,
          normalizedText(nextMarker).length,
        );
        if (!nextRange) return undefined;
        end = nextRange.start;
      }
      return { index, start: markerRange.end, end };
    }
    blockStart = nextBlockStart;
  }
  return undefined;
}

function alignedWordStart(
  segmentText: string,
  quote: string,
  quoteOffset: number,
  words: NonNullable<
    NonNullable<Source["transcript"]>["segments"]
  >[number]["words"],
): number | undefined {
  if (!quote || !words?.length) return undefined;
  const segment = normalizedText(segmentText);
  const normalizedOffset = normalizedIndexAt(segmentText, quoteOffset);
  if (normalizedOffset > segment.length - quote.length) return undefined;
  if (
    segment.slice(normalizedOffset, normalizedOffset + quote.length) !== quote
  )
    return undefined;

  const normalizedWords = words
    .map((word) => ({ word, text: normalizedQuote(word.text) }))
    .filter((item) => item.text);
  if (!normalizedWords.length) return undefined;
  const wordText = normalizedWords.map((item) => item.text).join(" ");
  if (
    wordText.slice(normalizedOffset, normalizedOffset + quote.length) !== quote
  )
    return undefined;
  const before = normalizedOffset > 0 ? wordText[normalizedOffset - 1] : "";
  const after = wordText[normalizedOffset + quote.length] || "";
  if (
    (before && !whitespace.test(before)) ||
    (after && !whitespace.test(after))
  )
    return undefined;

  let cursor = 0;
  for (let index = 0; index < normalizedWords.length; index++) {
    if (cursor === normalizedOffset) return normalizedWords[index].word.start;
    cursor += normalizedWords[index].text.length + 1;
  }
  return undefined;
}

function locationForRange(
  source: Source,
  startOffset: number,
  endOffset: number,
): EvidenceLocation | undefined {
  if (
    !Number.isSafeInteger(startOffset) ||
    !Number.isSafeInteger(endOffset) ||
    startOffset < 0 ||
    endOffset <= startOffset ||
    endOffset > source.text.length
  )
    return undefined;

  if (source.transcript) {
    const segment = transcriptSegmentIndex(
      source.text,
      startOffset,
      source.transcript,
    );
    if (segment) {
      const transcriptSegment = source.transcript.segments[segment.index];
      const segmentText = source.text.slice(segment.start, segment.end);
      const quote = normalizedQuote(
        source.text.slice(startOffset, Math.min(endOffset, segment.end)),
      );
      const wordStart = alignedWordStart(
        segmentText,
        quote,
        startOffset - segment.start,
        transcriptSegment.words,
      );
      const startSeconds = wordStart ?? transcriptSegment.start;
      return {
        label: `at ${timestamp(startSeconds)}`,
        startSeconds,
        startOffset,
        endOffset,
      };
    }
    return { label: "Source passage", startOffset, endOffset };
  }

  return {
    label: pageOrSlideLabel(source.text, startOffset) || "Source passage",
    startOffset,
    endOffset,
  };
}

/** Locate an already validated source range without matching its text again. */
export function locateSourceRange(
  source: Source,
  startOffset: number,
  endOffset: number,
): EvidenceLocation | undefined {
  return locationForRange(source, startOffset, endOffset);
}

/** Locate an exact source quote while retaining offsets in the original text. */
export function locateEvidence(
  source: Source,
  quote: string,
): EvidenceLocation | undefined {
  const query = normalizedQuote(quote);
  if (!query) return undefined;

  // Quotes without whitespace can be located directly without normalizing the
  // entire source. The bounded normalized fallback handles collapsed whitespace.
  const hasWhitespace = whitespace.test(query);
  let normalizedStart: number;
  let normalizedSource: string | undefined;
  if (!hasWhitespace) {
    normalizedStart = source.text.indexOf(query);
    if (normalizedStart < 0) return undefined;
  } else {
    normalizedSource = normalizedText(source.text);
    normalizedStart = normalizedSource.indexOf(query);
    if (normalizedStart < 0) return undefined;
  }
  const range = normalizedSource
    ? originalRangeAt(source.text, normalizedStart, query.length)
    : { start: normalizedStart, end: normalizedStart + query.length };
  if (!range) return undefined;
  return locationForRange(source, range.start, range.end);
}
