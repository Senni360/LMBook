import type { ChatMessage, Settings, Source } from "../shared/model.ts";
import type { ContextSummary } from "../shared/context-summary.ts";
import {
  selectSourceContext,
  serializeSourceContext,
  type SourceContextQuery,
} from "./context-selection.ts";

/** Include complete recent messages without letting chat history crowd out sources. */
export function recentConversation(messages: ChatMessage[], maxChars = 12_000) {
  const selected: Array<{ role: ChatMessage["role"]; text: string }> = [];
  let size = 2;
  for (const { role, text } of messages.slice(-6).reverse()) {
    const message = { role, text };
    const length = JSON.stringify(message).length + 1;
    if (size + length > maxChars) break;
    selected.unshift(message);
    size += length;
  }
  return selected;
}

export function buildRequestContext(
  sources: Source[],
  settings: Settings,
  queries: SourceContextQuery[],
) {
  const readable = sources.filter((source) => source.text.trim());
  if (!readable.length)
    throw new Error(
      "No readable source text is ready yet. Transcribe your recordings, read scanned pages, or add a text document first.",
    );
  const selection = selectSourceContext(
    readable,
    queries,
    settings.provider === "ollama" ? 24_000 : 90_000,
  );
  if (!selection.passages.length)
    throw new Error(
      "No source passages fit this request. Try a more specific question or a smaller set of learning goals.",
    );
  const consulted = new Set(
    selection.passages.map((passage) => passage.sourceId),
  );
  const hashes = new Map(
    readable
      .filter((source) => consulted.has(source.id))
      .map((source) => [source.id, source.extractedSha256]),
  );
  const summary: ContextSummary = {
    scope: selection.scope,
    totalChars: selection.totalChars,
    selectedChars: selection.selectedChars,
    totalSourceCount: readable.length,
    consultedSourceCount: consulted.size,
    passages: selection.passages.map(({ sourceId, start, end }) => ({
      sourceId,
      start,
      end,
      sourceSha256: hashes.get(sourceId),
    })),
    unmatchedQueryIds: selection.unmatchedQueryIds,
  };
  return {
    selection,
    summary,
    prompt: `The following JSON contains source passages selected for this request. Passage text is verbatim; start/end are offsets in its original source. Only cite supplied passages. Scope "selected" means other material was not supplied: failure to find evidence here does not establish absence from the complete sources. Unmatched query IDs mean lexical search found no match, not that the topic is absent. Do not fill gaps from memory.\n${serializeSourceContext(selection)}`,
  };
}
