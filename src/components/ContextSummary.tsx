import { useState } from "react";
import { ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import type { Source } from "../../shared/model";
import type {
  ContextPassage,
  ContextSummary as ContextSummaryData,
} from "../../shared/context-summary";
import { locateSourceRange } from "../../shared/evidence-location";
import "./context-summary.css";

const MAX_OPEN_QUOTE_CHARS = 300;
const MAX_EXCERPT_CHARS = 260;

export type ContextSummaryProps = {
  summary: ContextSummaryData;
  sources: Source[];
  onOpenSource?: (
    sourceId: string,
    quote?: string,
    startSeconds?: number,
    range?: { startOffset: number; endOffset: number },
  ) => void;
};

function sourceName(source: Source): string {
  return source.filename || source.attachment?.filename || source.title;
}

function excerptFor(
  source: Source,
  passage: ContextPassage,
): { quote: string; display: string } | undefined {
  if (
    !Number.isSafeInteger(passage.start) ||
    !Number.isSafeInteger(passage.end) ||
    passage.start < 0 ||
    passage.end <= passage.start ||
    passage.end > source.text.length
  )
    return undefined;
  const quote = source.text.slice(
    passage.start,
    Math.min(passage.end, passage.start + MAX_OPEN_QUOTE_CHARS),
  );
  const display = quote.replace(/\s+/gu, " ").trim();
  if (!display) return undefined;
  return {
    quote,
    display:
      display.length > MAX_EXCERPT_CHARS
        ? `${display.slice(0, MAX_EXCERPT_CHARS - 1).trimEnd()}…`
        : display,
  };
}

function sourceChanged(source: Source, passage: ContextPassage): boolean {
  return (
    passage.sourceSha256 !== undefined &&
    source.extractedSha256 !== undefined &&
    source.extractedSha256 !== passage.sourceSha256
  );
}

function numberLabel(value: number): string {
  return value.toLocaleString();
}

export function ContextSummary({
  summary,
  sources,
  onOpenSource,
}: ContextSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const selectedLabel =
    summary.scope === "selected"
      ? `Selected passages from ${summary.consultedSourceCount} of ${summary.totalSourceCount} sources`
      : `Read ${summary.consultedSourceCount} source${summary.consultedSourceCount === 1 ? "" : "s"}`;
  const visiblePassages = summary.passages.slice(0, visibleCount);
  const remaining = Math.max(
    summary.passages.length - visiblePassages.length,
    0,
  );

  return (
    <details
      className="context-summary"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <span className="context-summary-heading">
          <span>{selectedLabel}</span>
          <small>
            {numberLabel(summary.selectedChars)} of{" "}
            {numberLabel(summary.totalChars)} characters
          </small>
        </span>
        <ChevronDown
          className="context-summary-chevron"
          size={16}
          aria-hidden="true"
        />
      </summary>

      {expanded && (
        <div className="context-summary-body">
          <p className="context-summary-note">
            {summary.scope === "selected"
              ? "Only these passages were supplied for this response; material elsewhere in your sources may have been missed."
              : "All readable source text was supplied for this response; recordings and scans still awaiting text were excluded."}
          </p>

          {summary.unmatchedQueryIds.length > 0 && (
            <p className="context-summary-unmatched" role="status">
              <TriangleAlert size={15} aria-hidden="true" />
              Search terms for {summary.unmatchedQueryIds.length} questions or
              goals had no direct match. Related material may use different
              wording.
            </p>
          )}

          {visiblePassages.length > 0 ? (
            <ol className="context-summary-list">
              {visiblePassages.map((passage, index) => {
                const source = sourceById.get(passage.sourceId);
                if (!source)
                  return (
                    <li
                      className="context-summary-passage context-summary-missing"
                      key={`${passage.sourceId}-${passage.start}-${index}`}
                    >
                      <span className="context-summary-passage-number">
                        {index + 1}
                      </span>
                      <span>
                        <strong>Source unavailable</strong>
                        <small>
                          This passage cannot be opened because its source is no
                          longer present.
                        </small>
                      </span>
                    </li>
                  );

                const changed = sourceChanged(source, passage);
                const unverified =
                  !passage.sourceSha256 || !source.extractedSha256;
                const excerpt =
                  !changed && !unverified
                    ? excerptFor(source, passage)
                    : undefined;
                const quote = excerpt?.quote;
                const canOpen = Boolean(onOpenSource && quote && !changed);
                return (
                  <li
                    className="context-summary-passage"
                    key={`${passage.sourceId}-${passage.start}-${passage.end}-${index}`}
                  >
                    <span className="context-summary-passage-number">
                      {index + 1}
                    </span>
                    <div className="context-summary-passage-content">
                      <div className="context-summary-passage-meta">
                        <strong>{sourceName(source)}</strong>
                        <span>
                          {numberLabel(passage.end - passage.start)} characters
                        </span>
                      </div>
                      {excerpt ? (
                        canOpen ? (
                          <button
                            type="button"
                            className="context-summary-excerpt context-summary-excerpt-button"
                            onClick={() => {
                              const location = locateSourceRange(
                                source,
                                passage.start,
                                passage.end,
                              );
                              onOpenSource?.(
                                source.id,
                                quote!,
                                location?.startSeconds,
                                location
                                  ? {
                                      startOffset: passage.start,
                                      endOffset: passage.end,
                                    }
                                  : undefined,
                              );
                            }}
                          >
                            “{excerpt.display}”
                            <ExternalLink size={14} aria-hidden="true" />
                          </button>
                        ) : (
                          <p className="context-summary-excerpt">
                            “{excerpt.display}”
                          </p>
                        )
                      ) : !changed && !unverified ? (
                        <p className="context-summary-stale">
                          This passage range no longer fits the current source.
                        </p>
                      ) : null}
                      {changed && (
                        <p className="context-summary-stale">
                          Source changed since this passage was selected; reopen
                          it from the current source list.
                        </p>
                      )}
                      {unverified && !changed && (
                        <p className="context-summary-stale">
                          This source version was not recorded, so the
                          historical passage cannot be verified.
                        </p>
                      )}
                      {(changed || unverified) && onOpenSource && (
                        <button
                          type="button"
                          className="context-summary-more"
                          onClick={() => onOpenSource(source.id)}
                        >
                          Open available source
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="context-summary-empty">
              No passage details were recorded.
            </p>
          )}

          {remaining > 0 && (
            <button
              type="button"
              className="context-summary-more"
              onClick={() => setVisibleCount((count) => count + 50)}
            >
              Show more passages ({numberLabel(remaining)} remaining)
            </button>
          )}
        </div>
      )}
    </details>
  );
}
