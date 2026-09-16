import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

type PaneSide = "left" | "right";
type PaneSizes = { left: number; right: number };

const TOTAL_WIDTH = 72;
const MINIMUM: Record<PaneSide, number> = { left: 14, right: 24 };
const DEFAULT_SIZES: PaneSizes = { left: 21, right: 39 };

function isPaneSizes(value: unknown): value is PaneSizes {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PaneSizes>;
  return (
    Number.isFinite(candidate.left) &&
    Number.isFinite(candidate.right) &&
    (candidate.left ?? 0) >= MINIMUM.left &&
    (candidate.right ?? 0) >= MINIMUM.right &&
    (candidate.left ?? Infinity) + (candidate.right ?? Infinity) <= TOTAL_WIDTH
  );
}

function readStoredSizes(storageKey: string): PaneSizes {
  try {
    const stored: unknown = JSON.parse(
      globalThis.localStorage?.getItem(storageKey) || "null",
    );
    return isPaneSizes(stored) ? stored : DEFAULT_SIZES;
  } catch {
    return DEFAULT_SIZES;
  }
}

function writeStoredSizes(storageKey: string, sizes: PaneSizes): void {
  try {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(sizes));
  } catch {
    // Storage can be unavailable in private or embedded web views.
  }
}

function removeStoredSizes(storageKey: string): void {
  try {
    globalThis.localStorage?.removeItem(storageKey);
  } catch {
    // Reset still works for this session when storage is unavailable.
  }
}

export function useWorkspacePanes(
  key: string,
  desk: RefObject<HTMLDivElement | null>,
) {
  const [sizes, setSizes] = useState<PaneSizes>(DEFAULT_SIZES);
  const current = useRef<PaneSizes>(DEFAULT_SIZES);
  const storageKey = `lmbook:panes:${key}`;

  useEffect(() => {
    const stored = readStoredSizes(storageKey);
    current.current = stored;
    setSizes(stored);
  }, [storageKey]);

  const commit = () => writeStoredSizes(storageKey, current.current);
  const reset = () => {
    current.current = DEFAULT_SIZES;
    setSizes(DEFAULT_SIZES);
    removeStoredSizes(storageKey);
  };
  const adjust = (side: PaneSide, requested: number) => {
    const previous = current.current;
    const other = side === "left" ? previous.right : previous.left;
    const maximum = Math.max(MINIMUM[side], TOTAL_WIDTH - other);
    const next = {
      ...previous,
      [side]: Math.max(MINIMUM[side], Math.min(maximum, requested)),
    } as PaneSizes;
    current.current = next;
    setSizes(next);
  };

  return {
    style: {
      "--nav-width": `${sizes.left}%`,
      "--learn-width": `${sizes.right}%`,
    } as CSSProperties,
    handle: (side: PaneSide) => {
      const other = side === "left" ? sizes.right : sizes.left;
      const maximum = Math.max(MINIMUM[side], TOTAL_WIDTH - other);
      return (
        <PaneHandle
          key={side}
          side={side}
          value={sizes[side]}
          minimum={MINIMUM[side]}
          maximum={maximum}
          desk={desk}
          onChange={(value) => adjust(side, value)}
          onCommit={commit}
          onReset={reset}
        />
      );
    },
  };
}

function PaneHandle({
  side,
  value,
  minimum,
  maximum,
  desk,
  onChange,
  onCommit,
  onReset,
}: {
  side: PaneSide;
  value: number;
  minimum: number;
  maximum: number;
  desk: RefObject<HTMLDivElement | null>;
  onChange: (value: number) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const dragging = useRef<{ x: number; value: number; width: number } | null>(
    null,
  );
  const keyboardValue = useRef(value);
  keyboardValue.current = value;
  const move = side === "left" ? 1 : -1;
  const stopPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    onCommit();
  };

  return (
    <div
      className={`workspace-resizer resize-${side}`}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={
        side === "left" ? "Resize notes pane" : "Resize learning pane"
      }
      aria-valuenow={Math.round(value)}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuetext={`${Math.round(value)} percent`}
      title="Drag to resize. Arrow keys adjust; double-click resets."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragging.current = {
          x: event.clientX,
          value,
          width: desk.current?.getBoundingClientRect().width || 1000,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const start = dragging.current;
        if (start)
          onChange(
            start.value +
              ((event.clientX - start.x) / start.width) * 100 * move,
          );
      }}
      onPointerUp={stopPointer}
      onPointerCancel={stopPointer}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const next =
            keyboardValue.current +
            (event.key === "ArrowRight" ? 2 : -2) * move;
          keyboardValue.current = next;
          onChange(next);
          onCommit();
        } else if (event.key === "Home") {
          event.preventDefault();
          keyboardValue.current = minimum;
          onChange(minimum);
          onCommit();
        } else if (event.key === "End") {
          event.preventDefault();
          keyboardValue.current = maximum;
          onChange(maximum);
          onCommit();
        }
      }}
    >
      <span />
    </div>
  );
}
