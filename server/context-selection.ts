import type { Source } from "../shared/model.ts";

export type SourceContextQuery = { id: string; text: string };
export type SourceContextPassage = {
  sourceId: string;
  title: string;
  kind: Source["kind"];
  start: number;
  end: number;
  text: string;
  queryIds: string[];
};
export type SourceContextResult = {
  passages: SourceContextPassage[];
  scope: "complete" | "selected";
  totalChars: number;
  selectedChars: number;
  budgetChars: number;
  omittedSourceIds: string[];
  unmatchedQueryIds: string[];
};

const MIN_WINDOW = 1_800;
const TARGET_WINDOW = 2_200;
const MAX_WINDOW = 2_500;
const MAX_QUERY_CANDIDATES = 24;
const MAX_GLOBAL_CANDIDATES = 600;
const TOKEN_RE = /[\p{L}\p{N}]+/gu;
const BOUNDARY_RE = /[.!?。！？](?=\s|$)/gu;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "with",
  "aan",
  "als",
  "bij",
  "de",
  "deze",
  "dit",
  "die",
  "door",
  "een",
  "en",
  "in",
  "is",
  "met",
  "na",
  "naar",
  "niet",
  "of",
  "om",
  "op",
  "te",
  "tot",
  "tussen",
  "uit",
  "van",
  "voor",
  "waar",
  "wat",
  "welke",
  "wie",
  "zijn",
  "zo",
  "explain",
  "describe",
  "discuss",
  "quote",
  "sources",
  "source",
  "understand",
  "compare",
  "clarify",
  "preserve",
  "verklaar",
  "beschrijf",
  "bespreek",
  "bron",
  "bronnen",
  "citeer",
  "vergelijk",
  "begrijp",
  "toelichten",
  "uitleg",
]);

type ReadableSource = {
  sourceIndex: number;
  source: Source;
  text: string;
  titleTokens: Set<string>;
  chunks: Chunk[];
};
type Chunk = {
  sourceIndex: number;
  start: number;
  end: number;
  text: string;
  foldedText: string;
  tokenCounts: Map<string, number>;
};
type ScoredChunk = Chunk & { score: number; queryId: string };
type Interval = {
  sourceIndex: number;
  start: number;
  end: number;
  queryIds: Set<string>;
};

function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US");
}

function terms(value: string) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of fold(value).match(TOKEN_RE) || []) {
    if (token.length < 2 || STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    result.push(token);
    if (result.length >= 80) break;
  }
  return result;
}

function tokenStream(value: string) {
  return (fold(value).match(TOKEN_RE) || []).filter(
    (token) => token.length >= 2 && !STOPWORDS.has(token),
  );
}

function safeIndex(text: string, index: number, isEnd: boolean) {
  let value = Math.max(0, Math.min(text.length, Math.floor(index)));
  if (value > 0 && value < text.length) {
    const previous = text.charCodeAt(value - 1);
    const current = text.charCodeAt(value);
    const splitsPair =
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      current >= 0xdc00 &&
      current <= 0xdfff;
    if (splitsPair) value += isEnd ? 1 : -1;
  }
  return value;
}

function boundaryBefore(
  text: string,
  min: number,
  preferred: number,
  max: number,
) {
  const lower = safeIndex(text, min, true);
  const target = safeIndex(text, preferred, true);
  const upper = safeIndex(text, max, true);
  const candidates: number[] = [];
  const boundedText = text.slice(lower, upper);
  for (const match of boundedText.matchAll(BOUNDARY_RE)) {
    const end = safeIndex(
      text,
      lower + (match.index || 0) + match[0].length,
      true,
    );
    if (end >= lower && end <= upper) candidates.push(end);
  }
  const beforeTarget = candidates.filter((end) => end <= target).pop();
  if (beforeTarget) return beforeTarget;
  if (candidates[0]) return candidates[0];
  for (let index = target; index >= lower; index--) {
    if (/\s/u.test(text[index] || "")) return safeIndex(text, index + 1, true);
  }
  for (let index = target; index <= upper; index++) {
    if (/\s/u.test(text[index] || "")) return safeIndex(text, index + 1, true);
  }
  return upper;
}

function chunkRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < text.length) {
    const remaining = text.length - start;
    if (remaining <= MAX_WINDOW) {
      ranges.push({
        start: safeIndex(text, start, false),
        end: safeIndex(text, text.length, true),
      });
      break;
    }
    const min = start + MIN_WINDOW;
    const max = Math.min(text.length, start + MAX_WINDOW);
    const end = Math.max(
      min,
      boundaryBefore(text, min, start + TARGET_WINDOW, max),
    );
    const safeEnd = safeIndex(text, Math.min(max, end), true);
    ranges.push({ start: safeIndex(text, start, false), end: safeEnd });
    const next = safeIndex(text, safeEnd - 120, false);
    start = next > start ? next : safeEnd;
  }
  if (ranges.length > 1) {
    const last = ranges[ranges.length - 1];
    if (last.end - last.start < MIN_WINDOW) {
      const minimumStart = safeIndex(text, text.length - MIN_WINDOW, false);
      const maximumStart = safeIndex(text, text.length - MAX_WINDOW, false);
      last.start = Math.max(maximumStart, minimumStart);
    }
  }
  return ranges;
}

function tokenCounts(text: string) {
  const counts = new Map<string, number>();
  for (const token of tokenStream(text))
    counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function readableSources(sources: Source[]) {
  return (Array.isArray(sources) ? sources : [])
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(
      ({ source }) =>
        source.processing?.status !== "pending" &&
        source.text.trim().length > 0,
    )
    .map(({ source, sourceIndex }): ReadableSource => {
      const text = source.text;
      const ranges = chunkRanges(text);
      return {
        sourceIndex,
        source,
        text,
        titleTokens: new Set(terms(source.title)),
        chunks: ranges.map(({ start, end }) => ({
          sourceIndex,
          start,
          end,
          text: text.slice(start, end),
          foldedText: fold(text.slice(start, end)),
          tokenCounts: tokenCounts(text.slice(start, end)),
        })),
      };
    });
}

function normalizedQueries(queries: SourceContextQuery[]) {
  const seen = new Set<string>();
  return (Array.isArray(queries) ? queries : [])
    .filter((query) => {
      if (
        !query ||
        typeof query.id !== "string" ||
        !query.id.trim() ||
        typeof query.text !== "string" ||
        !query.text.trim() ||
        seen.has(query.id)
      )
        return false;
      seen.add(query.id);
      return true;
    })
    .map((query) => ({
      id: query.id,
      text: query.text.trim(),
      tokens: terms(query.text),
      phrase: fold(query.text).trim(),
    }));
}

function scoreChunks(
  readable: ReadableSource[],
  query: ReturnType<typeof normalizedQueries>,
) {
  const documentFrequency = new Map<string, number>();
  const allChunks = readable.flatMap((item) => item.chunks);
  for (const chunk of allChunks) {
    for (const token of chunk.tokenCounts.keys())
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
  }
  const totalChunks = Math.max(1, allChunks.length);
  const scored = new Map<string, ScoredChunk[]>();
  const maxByChunk = new Map<string, ScoredChunk>();
  const matchingQueriesByChunk = new Map<string, Set<string>>();
  for (const current of query) {
    const scoredForQuery: ScoredChunk[] = [];
    for (const item of readable) {
      for (const chunk of item.chunks) {
        let score = 0;
        let hits = 0;
        let idfTotal = 0;
        for (const token of current.tokens) {
          const count = chunk.tokenCounts.get(token) || 0;
          const idf = Math.log(
            1 + totalChunks / (1 + (documentFrequency.get(token) || 0)),
          );
          idfTotal += idf;
          if (count) {
            hits++;
            score += (1 + Math.log(count)) * idf;
          }
          if (item.titleTokens.has(token)) score += idf * 1.25;
        }
        if (
          current.phrase.length >= 8 &&
          chunk.foldedText.includes(current.phrase)
        )
          score += idfTotal * 1.5;
        // A relevant title alone does not make every paragraph in a long
        // document relevant. Broad sampling handles title-only/no-hit cases.
        if (!hits) continue;
        score *= 0.5 + 0.5 * (hits / Math.max(1, current.tokens.length));
        if (item.source.kind === "course") score *= 1.05;
        const candidate = { ...chunk, score, queryId: current.id };
        scoredForQuery.push(candidate);
        const key = `${chunk.sourceIndex}:${chunk.start}:${chunk.end}`;
        const matchingQueries =
          matchingQueriesByChunk.get(key) || new Set<string>();
        matchingQueries.add(current.id);
        matchingQueriesByChunk.set(key, matchingQueries);
        const previous = maxByChunk.get(key);
        if (
          !previous ||
          candidate.score > previous.score ||
          (candidate.score === previous.score &&
            candidate.queryId < previous.queryId)
        )
          maxByChunk.set(key, candidate);
      }
    }
    scoredForQuery.sort(
      (a, b) =>
        b.score - a.score ||
        a.sourceIndex - b.sourceIndex ||
        a.start - b.start ||
        a.queryId.localeCompare(b.queryId),
    );
    scored.set(current.id, scoredForQuery);
  }
  const global = [...maxByChunk.values()].sort(
    (a, b) =>
      b.score - a.score ||
      a.sourceIndex - b.sourceIndex ||
      a.start - b.start ||
      a.queryId.localeCompare(b.queryId),
  );
  return { scored, global, matchingQueriesByChunk };
}

function mergeInterval(
  intervals: Interval[],
  candidate: Chunk & { queryId: string },
) {
  const matching = intervals.filter(
    (item) =>
      item.sourceIndex === candidate.sourceIndex &&
      item.end >= candidate.start &&
      item.start <= candidate.end,
  );
  if (!matching.length) {
    intervals.push({
      sourceIndex: candidate.sourceIndex,
      start: candidate.start,
      end: candidate.end,
      queryIds: candidate.queryId ? new Set([candidate.queryId]) : new Set(),
    });
    return;
  }
  const merged: Interval = {
    sourceIndex: candidate.sourceIndex,
    start: Math.min(candidate.start, ...matching.map((item) => item.start)),
    end: Math.max(candidate.end, ...matching.map((item) => item.end)),
    queryIds: new Set([
      ...(candidate.queryId ? [candidate.queryId] : []),
      ...matching.flatMap((item) => [...item.queryIds]),
    ]),
  };
  for (const item of matching) intervals.splice(intervals.indexOf(item), 1);
  intervals.push(merged);
}

function splitInterval(
  readable: ReadableSource[],
  interval: Interval,
): SourceContextPassage[] {
  const item = readable.find(
    (candidate) => candidate.sourceIndex === interval.sourceIndex,
  )!;
  const queryIds = [...interval.queryIds].sort();
  const result: SourceContextPassage[] = [];
  let start = interval.start;
  while (start < interval.end) {
    const remaining = interval.end - start;
    const end =
      remaining <= MAX_WINDOW
        ? interval.end
        : boundaryBefore(
            item.text,
            start + MIN_WINDOW,
            start + TARGET_WINDOW,
            Math.min(interval.end, start + MAX_WINDOW),
          );
    const safeEnd = safeIndex(
      item.text,
      Math.max(start + 1, Math.min(interval.end, end)),
      true,
    );
    result.push({
      sourceId: item.source.id,
      title: item.source.title,
      kind: item.source.kind,
      start: safeIndex(item.text, start, false),
      end: safeEnd,
      text: item.text.slice(start, safeEnd),
      queryIds,
    });
    if (safeEnd >= interval.end) break;
    start = safeEnd;
  }
  if (result.length > 1) {
    const last = result[result.length - 1];
    if (last.end - last.start < MIN_WINDOW) {
      last.start = safeIndex(item.text, last.end - MIN_WINDOW, false);
      last.text = item.text.slice(last.start, last.end);
    }
  }
  return result;
}

function passagesFromIntervals(
  readable: ReadableSource[],
  intervals: Interval[],
) {
  return intervals
    .sort((a, b) => a.sourceIndex - b.sourceIndex || a.start - b.start)
    .flatMap((interval) => splitInterval(readable, interval));
}

function broadCandidates(readable: ReadableSource[]) {
  // Round-robin by position keeps a long first source from consuming all of
  // the fallback budget. Empty queryIds are intentional: these passages are
  // coverage samples, not evidence that a query matched.
  const positions = [0, 0.25, 0.5, 0.75, 1];
  const seen = new Set<string>();
  const candidates: Array<Chunk & { queryId: string }> = [];
  for (const position of positions) {
    for (const item of readable) {
      if (!item.chunks.length) continue;
      const index = Math.min(
        item.chunks.length - 1,
        Math.floor(position * (item.chunks.length - 1)),
      );
      const chunk = item.chunks[index];
      const key = `${chunk.sourceIndex}:${chunk.start}:${chunk.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ ...chunk, queryId: "" });
    }
  }
  return candidates;
}

function selectionResult(
  passages: SourceContextPassage[],
  readable: ReadableSource[],
  queries: ReturnType<typeof normalizedQueries>,
  budgetChars: number,
  scope: SourceContextResult["scope"],
): SourceContextResult {
  const selectedBySource = new Map<string, number>();
  const selectedQueryIds = new Set(
    passages.flatMap((passage) => passage.queryIds),
  );
  const rangesBySource = new Map<
    string,
    Array<{ start: number; end: number }>
  >();
  for (const passage of passages) {
    const ranges = rangesBySource.get(passage.sourceId) || [];
    ranges.push({ start: passage.start, end: passage.end });
    rangesBySource.set(passage.sourceId, ranges);
  }
  for (const [sourceId, ranges] of rangesBySource) {
    ranges.sort((a, b) => a.start - b.start);
    let selected = 0;
    let current = ranges[0];
    for (const range of ranges.slice(1)) {
      if (range.start > current.end) {
        selected += current.end - current.start;
        current = range;
      } else {
        current.end = Math.max(current.end, range.end);
      }
    }
    if (current) selected += current.end - current.start;
    selectedBySource.set(sourceId, selected);
  }
  const readableIds = readable.map((item) => item.source.id);
  return {
    passages,
    scope,
    totalChars: readable.reduce((sum, item) => sum + item.text.length, 0),
    selectedChars: [...selectedBySource.values()].reduce(
      (sum, value) => sum + value,
      0,
    ),
    budgetChars,
    omittedSourceIds: readableIds.filter((id) => !selectedBySource.has(id)),
    unmatchedQueryIds: queries
      .map((query) => query.id)
      .filter((id) => !selectedQueryIds.has(id)),
  };
}

function serializedLength(result: SourceContextResult) {
  return JSON.stringify(result).length;
}

export function serializeSourceContext(result: SourceContextResult) {
  return JSON.stringify({
    scope: result.scope,
    totalChars: result.totalChars,
    selectedChars: result.selectedChars,
    budgetChars: result.budgetChars,
    omittedSourceIds: result.omittedSourceIds,
    unmatchedQueryIds: result.unmatchedQueryIds,
    passages: result.passages,
  });
}

export function selectSourceContext(
  sources: Source[],
  queries: SourceContextQuery[],
  budgetChars: number,
): SourceContextResult {
  const budget = Number.isFinite(budgetChars)
    ? Math.max(1, Math.floor(budgetChars))
    : 1;
  const readable = readableSources(sources);
  const normalized = normalizedQueries(queries);
  if (!readable.length)
    return selectionResult([], readable, normalized, budget, "complete");
  const scored = scoreChunks(readable, normalized);

  const completeIntervals: Interval[] = [];
  for (const item of readable) {
    for (const chunk of item.chunks) {
      mergeInterval(completeIntervals, { ...chunk, queryId: "" });
      const interval = completeIntervals.find(
        (candidate) =>
          candidate.sourceIndex === chunk.sourceIndex &&
          candidate.start <= chunk.start &&
          candidate.end >= chunk.end,
      );
      for (const queryId of scored.matchingQueriesByChunk.get(
        `${chunk.sourceIndex}:${chunk.start}:${chunk.end}`,
      ) || [])
        interval?.queryIds.add(queryId);
    }
  }
  const complete = selectionResult(
    passagesFromIntervals(readable, completeIntervals),
    readable,
    normalized,
    budget,
    "complete",
  );
  if (serializedLength(complete) <= budget) return complete;

  const intervals: Interval[] = [];
  const selected = () =>
    selectionResult(
      passagesFromIntervals(readable, intervals),
      readable,
      normalized,
      budget,
      "selected",
    );
  const tryAdd = (candidate: Chunk & { queryId: string }) => {
    const before = intervals.map((item) => ({
      ...item,
      queryIds: new Set(item.queryIds),
    }));
    mergeInterval(intervals, candidate);
    if (serializedLength(selected()) > budget) {
      intervals.splice(0, intervals.length, ...before);
      return false;
    }
    return true;
  };

  // One pass per query prevents the first broad goal from consuming the budget.
  for (const query of normalized) {
    const candidates = scored.scored.get(query.id) || [];
    for (const candidate of candidates.slice(0, MAX_QUERY_CANDIDATES)) {
      if (tryAdd(candidate)) break;
    }
  }

  if (!scored.global.length) {
    // With no lexical hits, sample each source at several stable positions.
    // Do not attach query ids: absence of a lexical hit is not evidence that
    // the query is absent from the source.
    for (const candidate of broadCandidates(readable)) tryAdd(candidate);
  } else {
    // Give each readable source one deterministic relevant window where possible.
    for (const item of readable) {
      const candidates = scored.global.filter(
        (candidate) => candidate.sourceIndex === item.sourceIndex,
      );
      const broad = candidates[0];
      if (broad) tryAdd(broad);
    }
  }

  for (const candidate of scored.global.slice(0, MAX_GLOBAL_CANDIDATES)) {
    tryAdd(candidate);
    if (serializedLength(selected()) >= budget - 1_000) break;
  }
  return selected();
}
