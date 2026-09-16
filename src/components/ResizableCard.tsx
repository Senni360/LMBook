import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { InkStroke } from "./InkControl";

const DEFAULT_MIN_HEIGHT = 220;
const DEFAULT_HEIGHT = 460;
const DEFAULT_MAX_HEIGHT = 1200;

function readHeight(key: string, fallback: number, min: number, max: number) {
  try {
    const value = Number.parseFloat(localStorage.getItem(key) || "");
    return Number.isFinite(value)
      ? Math.max(min, Math.min(max, value))
      : fallback;
  } catch {
    return fallback;
  }
}

function saveHeight(key: string, value: number) {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Embedded/private web views can make storage unavailable.
  }
}

function removeHeight(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Reset remains effective for this session when storage is unavailable.
  }
}

export type ResizableCardProps = {
  storageKey: string;
  label: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  hidden?: boolean;
};

/** A bounded, persisted desktop card with pointer and keyboard height controls. */
export function ResizableCard({
  storageKey,
  label,
  children,
  className = "",
  contentClassName = "",
  defaultHeight = DEFAULT_HEIGHT,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxHeight = DEFAULT_MAX_HEIGHT,
  hidden = false,
}: ResizableCardProps) {
  const safeDefault = Math.max(minHeight, Math.min(maxHeight, defaultHeight));
  const [height, setHeight] = useState(() =>
    readHeight(storageKey, safeDefault, minHeight, maxHeight),
  );
  const current = useRef(height);
  const card = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ y: number; height: number; max: number } | null>(
    null,
  );
  current.current = height;

  useEffect(() => {
    const next = readHeight(storageKey, safeDefault, minHeight, maxHeight);
    current.current = next;
    setHeight(next);
  }, [storageKey, safeDefault, minHeight, maxHeight]);

  const clamp = (value: number, max = maxHeight) =>
    Math.max(minHeight, Math.min(max, value));
  const commit = () => saveHeight(storageKey, current.current);
  const reset = () => {
    current.current = safeDefault;
    setHeight(safeDefault);
    removeHeight(storageKey);
  };
  const change = (value: number, max = maxHeight) => {
    const next = clamp(value, Math.max(minHeight, max));
    current.current = next;
    setHeight(next);
  };

  function stopPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    commit();
  }

  return (
    <div
      ref={card}
      hidden={hidden}
      className={`workspace-card ${className}`.trim()}
      style={{ "--card-height": `${height}px` } as CSSProperties}
    >
      <div className={`workspace-card-content ${contentClassName}`.trim()}>
        {children}
      </div>
      <InkStroke owner={card} />
      <div
        className="workspace-card-resizer"
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={`Resize ${label}`}
        aria-valuenow={Math.round(height)}
        aria-valuemin={minHeight}
        aria-valuemax={maxHeight}
        aria-valuetext={`${Math.round(height)} pixels`}
        title="Drag to resize. Arrow keys adjust; Enter or double-click resets."
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = {
            y: event.clientY,
            height,
            max: maxHeight,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const start = dragging.current;
          if (start) change(start.height + event.clientY - start.y, start.max);
        }}
        onPointerUp={stopPointer}
        onPointerCancel={stopPointer}
        onLostPointerCapture={() => {
          if (dragging.current) {
            dragging.current = null;
            commit();
          }
        }}
        onDoubleClick={reset}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            reset();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            change(height + (event.key === "ArrowDown" ? 24 : -24));
            commit();
          } else if (event.key === "Home") {
            event.preventDefault();
            change(minHeight, minHeight);
            commit();
          } else if (event.key === "End") {
            event.preventDefault();
            change(maxHeight, maxHeight);
            commit();
          }
        }}
      >
        <span />
      </div>
    </div>
  );
}
