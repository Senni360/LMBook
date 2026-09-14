import { useState } from "react";
import type { Source } from "../../shared/model";
import "./source-image.css";

export function SourceImage({
  source,
  notebookId,
  episodeId,
}: {
  source: Source;
  notebookId: string;
  episodeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (
    !source.attachment ||
    !["image/png", "image/jpeg"].includes(source.attachment.mediaType)
  )
    return null;
  const url = `/api/notebooks/${encodeURIComponent(notebookId)}/sources/${encodeURIComponent(source.id)}/image${episodeId ? `?episode=${encodeURIComponent(episodeId)}` : ""}`;
  return (
    <details
      className="source-image"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>View original image</summary>
      {open &&
        (failed ? (
          <p role="alert">
            The original image could not be displayed. Use Download original to
            check the saved file.
          </p>
        ) : (
          <figure>
            <img
              src={url}
              alt={`Original uploaded page: ${source.title}`}
              onError={() => setFailed(true)}
            />
            <figcaption>
              Compare important words and numbers with the original. Download
              the file to inspect it at full size.
            </figcaption>
          </figure>
        ))}
    </details>
  );
}
