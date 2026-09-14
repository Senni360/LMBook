import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  CircleAlert,
  Download,
  LoaderCircle,
  X,
} from "lucide-react";
import "./downloads.css";

type DownloadState = {
  id: string;
  name: string;
  state: "pending" | "completed" | "cancelled" | "failed";
  received: number;
  total?: number;
  started: boolean;
  error?: string;
};
const DownloadsContext = createContext<{
  pending: boolean;
  start: (path: string, name: string) => void;
} | null>(null);
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DownloadState | null>(null);
  const active = useRef<string | null>(null);
  useEffect(
    () =>
      window.sennibookDesktop?.onDownloadProgress?.((event) => {
        setCurrent((previous) =>
          previous?.id === event.id && previous.state === "pending"
            ? {
                ...previous,
                started: true,
                received: event.received,
                total: event.total,
              }
            : previous,
        );
      }),
    [],
  );
  const start = (path: string, name: string) => {
    const desktop = window.sennibookDesktop;
    if (!desktop?.download || active.current) return;
    const id = crypto.randomUUID();
    active.current = id;
    setCurrent({ id, name, state: "pending", received: 0, started: false });
    void desktop
      .download(id, path, name)
      .then((result) =>
        setCurrent((previous) =>
          previous?.id === id
            ? { ...previous, state: result.status }
            : previous,
        ),
      )
      .catch((error) =>
        setCurrent((previous) =>
          previous?.id === id
            ? {
                ...previous,
                state: "failed",
                error:
                  error instanceof Error
                    ? error.message
                    : "The file could not be saved. Try again.",
              }
            : previous,
        ),
      )
      .finally(() => {
        if (active.current === id) active.current = null;
      });
  };
  const cancel = () => {
    if (!current || current.state !== "pending") return;
    const id = current.id;
    void window.sennibookDesktop?.cancelDownload(id).catch(() => {
      setCurrent((previous) =>
        previous?.id === id && previous.state === "pending"
          ? {
              ...previous,
              error: "Cancellation could not be requested. Try again.",
            }
          : previous,
      );
    });
  };
  const pending = current?.state === "pending";
  const Icon = pending
    ? LoaderCircle
    : current?.state === "failed"
      ? CircleAlert
      : current?.state === "completed"
        ? CheckCircle2
        : Download;
  return (
    <DownloadsContext.Provider value={{ pending, start }}>
      {children}
      {current && (
        <section className="download-status" aria-label="File download">
          <div className="download-status-heading">
            <Icon
              size={18}
              className={pending ? "spin" : undefined}
              aria-hidden="true"
            />
            <strong>{current.name}</strong>
            {!pending && (
              <button
                className="icon-button"
                aria-label="Dismiss download status"
                onClick={() => setCurrent(null)}
              >
                <X size={18} />
              </button>
            )}
          </div>
          <p role="status">
            {pending
              ? current.started
                ? "Saving file…"
                : "Choose where to save the file…"
              : current.state === "completed"
                ? "File saved."
                : current.state === "cancelled"
                  ? "Download cancelled."
                  : "The download could not finish."}
          </p>
          {pending && current.started && (
            <p aria-hidden="true">
              {size(current.received)}
              {current.total ? ` of ${size(current.total)}` : ""}
            </p>
          )}
          {pending && (
            <progress
              aria-label="Download progress"
              max={current.total || undefined}
              value={
                current.total
                  ? Math.min(current.received, current.total)
                  : undefined
              }
            />
          )}
          {current.error && (
            <p className="download-error" role="alert">
              {current.error}
            </p>
          )}
          {pending && (
            <button className="button quiet" onClick={cancel}>
              Cancel download
            </button>
          )}
        </section>
      )}
    </DownloadsContext.Provider>
  );
}

export function DownloadLink({
  href,
  filename,
  children,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  filename: string;
}) {
  const downloads = useContext(DownloadsContext);
  const desktop = !!window.sennibookDesktop?.download;
  return (
    <a
      {...props}
      href={href}
      aria-disabled={(desktop && downloads?.pending) || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !desktop || !downloads) return;
        event.preventDefault();
        downloads.start(href, filename);
      }}
    >
      {children}
    </a>
  );
}
