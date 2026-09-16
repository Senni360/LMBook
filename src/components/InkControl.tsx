import {
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type RefObject,
} from "react";

type Size = { width: number; height: number; underline: boolean };
const subscribers = new Map<Element, (size: Size) => void>();
const visibilityGroups = new Map<Element, Set<Element>>();
const visibleGroups = new WeakSet<Element>();
let sizes: ResizeObserver | undefined;
let visibility: IntersectionObserver | undefined;

function observe(element: HTMLElement, update: (size: Size) => void) {
  sizes ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.borderBoxSize[0];
      if (!box) continue;
      subscribers.get(entry.target)?.({
        width: box.inlineSize,
        height: box.blockSize,
        underline:
          !!entry.target.closest(".tabs, .flash-tabs, .filter-group") ||
          entry.target.matches(
            ".evidence-link, .source-open, .objective-main, .rail-settings",
          ),
      });
    }
  });
  visibility ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleGroups.add(entry.target);
        else visibleGroups.delete(entry.target);
        for (const control of visibilityGroups.get(entry.target) || []) {
          if (entry.isIntersecting) sizes?.observe(control);
          else sizes?.unobserve(control);
        }
      }
    },
    { rootMargin: "80px" },
  );
  subscribers.set(element, update);
  const target = element.closest(".flash-word-box") || element;
  let group = visibilityGroups.get(target);
  if (!group) {
    group = new Set();
    visibilityGroups.set(target, group);
    visibility.observe(target);
  }
  group.add(element);
  if (visibleGroups.has(target)) sizes.observe(element);
  return () => {
    subscribers.delete(element);
    sizes?.unobserve(element);
    group.delete(element);
    if (!group.size) {
      visibility?.unobserve(target);
      visibilityGroups.delete(target);
      visibleGroups.delete(target);
    }
    if (!subscribers.size) {
      sizes?.disconnect();
      visibility?.disconnect();
      sizes = undefined;
      visibility = undefined;
    }
  };
}

function contour(
  width: number,
  height: number,
  identity: string,
  underline: boolean,
) {
  let seed = 2166136261;
  for (const char of identity)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const vary = (range: number) => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    return ((seed >>> 0) / 4294967295 - 0.5) * range;
  };
  const w = Math.max(12, width),
    h = Math.max(12, height);
  const left = 1.8 + vary(0.5),
    right = w - 1.8 + vary(0.5);
  const top = 1.8 + vary(0.5),
    bottom = h - 1.8 + vary(0.5);
  if (underline)
    return `M ${left} ${bottom - 0.5} C ${w * 0.27} ${bottom - 1.5 + vary(1)} ${w * 0.66} ${bottom + vary(1)} ${right} ${bottom - 0.6}`;
  const corner = () => Math.min(7 + vary(6), h * 0.24, w * 0.24);
  const tl = corner(),
    tr = corner(),
    br = corner(),
    bl = corner();
  return [
    `M ${left + tl} ${top}`,
    `C ${w * 0.32} ${top + vary(3)} ${w * 0.69} ${top + vary(3)} ${right - tr} ${top + vary(0.6)}`,
    `Q ${right + vary(0.5)} ${top + vary(0.5)} ${right} ${top + tr}`,
    `C ${right + vary(2)} ${h * 0.36} ${right + vary(2)} ${h * 0.7} ${right - vary(0.4)} ${bottom - br}`,
    `Q ${right} ${bottom + vary(0.5)} ${right - br} ${bottom}`,
    `C ${w * 0.65} ${bottom + vary(3)} ${w * 0.29} ${bottom + vary(3)} ${left + bl} ${bottom + vary(0.5)}`,
    `Q ${left + vary(0.6)} ${bottom} ${left} ${bottom - bl}`,
    `C ${left + vary(2)} ${h * 0.65} ${left + vary(2)} ${h * 0.34} ${left} ${top + tl}`,
    `Q ${left} ${top + vary(0.5)} ${left + tl} ${top} Z`,
  ]
    .join(" ")
    .replace(/-?\d+\.\d+/g, (value) => Number(value).toFixed(2));
}

export function InkStroke({
  lazy = false,
  owner,
}: {
  lazy?: boolean;
  owner?: RefObject<HTMLElement | null>;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size>({
    width: lazy ? 0 : 160,
    height: 40,
    underline: false,
  });
  useEffect(() => {
    const control = owner?.current || svg.current?.parentElement;
    if (!control) return;
    return observe(control, (next) =>
      setSize((current) =>
        current.width === next.width &&
        current.height === next.height &&
        current.underline === next.underline
          ? current
          : next,
      ),
    );
  }, []);
  const path = useMemo(
    () =>
      size.width ? contour(size.width, size.height, id, size.underline) : "",
    [size, id],
  );
  if (lazy && !size.width) return null;
  return (
    <svg
      ref={svg}
      className="ink-contour"
      data-ready={size.width > 0 || undefined}
      data-underline={size.underline || undefined}
      viewBox={`0 0 ${Math.max(12, size.width)} ${Math.max(12, size.height)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {size.width > 0 && (
        <>
          <path
            className="ink-contour-base"
            d={path}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="ink-contour-trace"
            d={path}
            pathLength="1"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

export function InkButton({
  children,
  title,
  className = "",
  ...props
}: ComponentPropsWithRef<"button">) {
  return (
    <button
      {...props}
      data-ink-tooltip={title}
      aria-description={props["aria-description"] || title}
      className={`${className} ink-control`}
    >
      {children}
      <InkStroke />
    </button>
  );
}

export function InkLink({
  children,
  title,
  className = "",
  ...props
}: ComponentPropsWithRef<"a">) {
  return (
    <a
      {...props}
      data-ink-tooltip={title}
      aria-description={props["aria-description"] || title}
      className={`${className} ink-control`}
    >
      {children}
      <InkStroke />
    </a>
  );
}

export function InkInput(props: ComponentPropsWithRef<"input">) {
  const owner = useRef<HTMLSpanElement>(null);
  if (props.type === "range") {
    const min = Number(props.min ?? 0),
      max = Number(props.max ?? 100);
    const progress = Math.max(
      0,
      Math.min(
        100,
        ((Number(props.value ?? props.defaultValue ?? min) - min) /
          (max - min || 1)) *
          100,
      ),
    );
    return (
      <input
        {...props}
        style={
          {
            "--range-progress": `${progress}%`,
            ...props.style,
          } as CSSProperties
        }
      />
    );
  }
  if (
    props.hidden ||
    ["hidden", "checkbox", "radio", "range"].includes(props.type || "")
  )
    return <input {...props} />;
  return (
    <span
      ref={owner}
      className="ink-field"
      data-disabled={props.disabled || undefined}
    >
      <input {...props} />
      <InkStroke lazy owner={owner} />
    </span>
  );
}

export function InkTextarea({
  surface = false,
  ...props
}: ComponentPropsWithRef<"textarea"> & { surface?: boolean }) {
  const owner = useRef<HTMLSpanElement>(null);
  if (surface) return <textarea {...props} />;
  return (
    <span
      ref={owner}
      className="ink-field"
      data-disabled={props.disabled || undefined}
    >
      <textarea {...props} />
      <InkStroke lazy owner={owner} />
    </span>
  );
}

export function InkSelect(props: ComponentPropsWithRef<"select">) {
  const owner = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={owner}
      className="ink-field"
      data-disabled={props.disabled || undefined}
    >
      <select {...props} />
      <InkStroke lazy owner={owner} />
    </span>
  );
}
