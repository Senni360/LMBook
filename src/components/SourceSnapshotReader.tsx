import { canAnimate, MotionSurface, useCitationMotion } from "./Motion";
import { useEffect, useRef } from "react";
import { Download, X } from "lucide-react";
import { DownloadLink } from "./Downloads";
import type { Source } from "../../shared/model";
import { SourceAudio } from "./SourceAudio";
import { SourceImage } from "./SourceImage";
import "./source-snapshot-reader.css";

export type SourceSnapshotReaderProps = {
  source: Source;
  notebookId: string;
  episodeId?: string;
  range?: { startOffset: number; endOffset: number };
  startSeconds?: number;
  onClose: () => void;
};

function clampOffset(value: number, length: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(length, Math.max(0, Math.floor(value)));
}

export function SourceSnapshotReader({
  source,
  notebookId,
  episodeId,
  range,
  startSeconds,
  onClose,
}: SourceSnapshotReaderProps) {
  const readerRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLElement>(null);
  const text = source.text || "";
  const hasRange = Boolean(
    range &&
    Number.isFinite(range.startOffset) &&
    Number.isFinite(range.endOffset) &&
    range.endOffset > range.startOffset,
  );
  const startOffset = hasRange
    ? clampOffset(range!.startOffset, text.length)
    : 0;
  const endOffset = hasRange ? clampOffset(range!.endOffset, text.length) : 0;
  const validRange = endOffset > startOffset;
  useCitationMotion(
    highlightRef,
    `${source.id}:${episodeId}:${startOffset}:${endOffset}`,
  );
  const hasAudioTarget =
    source.attachment?.mediaType.startsWith("audio/") &&
    startSeconds !== undefined &&
    source.transcript?.segments.some(
      (segment, index, segments) =>
        startSeconds >= segment.start &&
        (startSeconds < segment.end ||
          (index === segments.length - 1 && startSeconds === segment.end)),
    );

  useEffect(() => {
    if (hasAudioTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const target = highlightRef.current || readerRef.current;
      if (!target) return;
      target.scrollIntoView({
        block: "center",
        behavior: canAnimate() ? "smooth" : "instant",
      });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    source.id,
    episodeId,
    startOffset,
    endOffset,
    startSeconds,
    validRange,
    hasAudioTarget,
  ]);

  const isAudio = source.attachment?.mediaType.startsWith("audio/");
  const downloadUrl = `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(source.id)}/original${episodeId ? `?episode=${encodeURIComponent(episodeId)}` : ""}`;

  return (
    <MotionSurface
      as="section"
      kind="reader"
      motionKey={`${source.id}:${episodeId}:${startOffset}:${endOffset}`}
      elementRef={readerRef}
      tabIndex={-1}
      className="reader source-snapshot-reader"
      aria-labelledby={`source-snapshot-title-${source.id}`}
    >
      <div className="section-heading source-snapshot-heading">
        <div>
          <span className="kicker">
            {episodeId
              ? "Source saved with this episode"
              : "Current source · no saved version in this older episode"}
          </span>
          <h3 id={`source-snapshot-title-${source.id}`}>{source.title}</h3>
        </div>
        <button type="button" className="button" onClick={onClose}>
          <X size={16} aria-hidden="true" /> Close source
        </button>
      </div>

      {source.attachment && (
        <DownloadLink
          className="button quiet source-snapshot-download"
          href={downloadUrl}
          filename={source.attachment.filename}
          download
        >
          <Download size={16} aria-hidden="true" /> Download original
        </DownloadLink>
      )}

      <SourceImage
        key={`${source.id}-${episodeId}`}
        source={source}
        notebookId={notebookId}
        episodeId={episodeId}
      />
      {isAudio ? (
        <SourceAudio
          key={`${source.id}-${episodeId}`}
          source={source}
          notebookId={notebookId}
          episodeId={episodeId}
          readOnly
          initialTime={startSeconds}
          disabled
          onChanged={async () => undefined}
          onSetup={() => undefined}
        />
      ) : (
        <div className="source-snapshot-text" tabIndex={0}>
          {validRange ? (
            <>
              {text.slice(0, startOffset)}
              <mark
                ref={highlightRef}
                className="source-snapshot-highlight"
                tabIndex={-1}
              >
                {text.slice(startOffset, endOffset)}
              </mark>
              {text.slice(endOffset)}
            </>
          ) : (
            text || "This source snapshot has no saved text."
          )}
        </div>
      )}
    </MotionSurface>
  );
}
