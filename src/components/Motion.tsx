import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowLeftRight } from "lucide-react";

export const motion = {
  quick: 120,
  change: 220,
  travel: 300,
  sheet: 360,
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
};
const preferenceKey = "lmbook:motion";
const preferenceEvent = "lmbook:motion-change";
type Preference = "system" | "reduced";
function preference(): Preference {
  try {
    return localStorage.getItem(preferenceKey) === "reduced"
      ? "reduced"
      : "system";
  } catch {
    return "system";
  }
}
export function canAnimate() {
  return (
    !document.hidden &&
    preference() !== "reduced" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
const active = new Map<HTMLElement, Animation>();
export function stopMotion(element: HTMLElement) {
  active.get(element)?.cancel();
  active.delete(element);
}
/** Animation never owns navigation, focus, saving or study state. */
export function playMotion(
  element: HTMLElement | null,
  frames: Keyframe[],
  options: KeyframeAnimationOptions = {},
) {
  if (!element) return;
  stopMotion(element);
  if (!canAnimate() || !element.animate) return;
  const animation = element.animate(frames, {
    duration: motion.change,
    easing: motion.ease,
    fill: "backwards",
    ...options,
  });
  active.set(element, animation);
  const done = () => {
    if (active.get(element) === animation) active.delete(element);
  };
  animation.addEventListener("finish", done, { once: true });
  animation.addEventListener("cancel", done, { once: true });
  return animation;
}

export function useMotionEnvironment() {
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const reduced = preference() === "reduced" || media.matches;
      document.documentElement.dataset.motion = reduced ? "reduced" : "full";
      document.documentElement.dataset.documentHidden = String(document.hidden);
      if (reduced || document.hidden)
        for (const element of [...active.keys()]) stopMotion(element);
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener(preferenceEvent, update);
    window.addEventListener("storage", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener(preferenceEvent, update);
      window.removeEventListener("storage", update);
      document.removeEventListener("visibilitychange", update);
      for (const element of [...active.keys()]) stopMotion(element);
    };
  }, []);
}

export function MotionPreferences() {
  const [value, setValue] = useState(preference);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setValue(preference());
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  return (
    <section className="motion-preferences">
      <h3>Motion</h3>
      <label>
        <span>Interface animations</span>
        <select
          value={value}
          onChange={(event) => {
            const next = event.target.value as Preference;
            try {
              localStorage.setItem(preferenceKey, next);
              setValue(next);
              setError("");
              window.dispatchEvent(new Event(preferenceEvent));
            } catch {
              setError("This preference could not be saved on this device.");
            }
          }}
        >
          <option value="system">Follow device preference</option>
          <option value="reduced">Reduce motion</option>
        </select>
      </label>
      <p>
        Transitions help you follow changes. Reduced motion keeps the same
        controls and feedback with movement removed.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

type Container = "div" | "section" | "nav" | "ol";
type ContainerProps = HTMLAttributes<HTMLElement> & {
  as?: Container;
  children: ReactNode;
};
export function MotionSurface({
  as = "div",
  motionKey,
  kind = "view",
  direction = 0,
  elementRef,
  children,
  ...props
}: ContainerProps & {
  motionKey: string;
  kind?: "view" | "reader";
  direction?: number;
  elementRef?: RefObject<HTMLElement | null>;
}) {
  const ownRef = useRef<HTMLElement>(null);
  const ref = elementRef || ownRef;
  const previousKey = useRef(motionKey);
  useLayoutEffect(() => {
    const node = ref.current;
    const changed = previousKey.current !== motionKey;
    previousKey.current = motionKey;
    if (!node) return;
    const animations: Animation[] = [];
    const add = (animation: Animation | undefined) => {
      if (animation) animations.push(animation);
    };
    if (kind === "reader") {
      add(
        playMotion(
          node,
          [
            { clipPath: "inset(0 0 96% 0 round 10px)" },
            { clipPath: "inset(0 0 0 0 round 10px)" },
          ],
          { duration: motion.sheet },
        ),
      );
      const heading = node.querySelector<HTMLElement>(".section-heading");
      add(
        playMotion(
          heading,
          [
            { transform: "translateY(-3px)" },
            { transform: "none", opacity: 1 },
          ],
          { duration: motion.travel },
        ),
      );
      const content = node.querySelector<HTMLElement>(
        ".source-text, .source-snapshot-text, .source-audio",
      );
      add(
        playMotion(
          content,
          [
            { transform: "translateY(-5px)" },
            { transform: "none", opacity: 1 },
          ],
          { duration: motion.travel, delay: 45 },
        ),
      );
    } else if (changed && direction !== 0) {
      add(
        playMotion(
          node,
          [
            { transform: `translateX(${-direction * 12}px)` },
            { transform: "none" },
          ],
          { duration: motion.travel },
        ),
      );
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [motionKey, kind, direction]);
  return createElement(as, { ...props, ref }, children);
}

type Position = { left: number; top: number };
function useListMotion(
  ref: RefObject<HTMLElement | null>,
  itemsKey: string,
  selector: string,
) {
  const positions = useRef(new Map<HTMLElement, Position>());
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const canIntroduce = initialized.current;
    initialized.current = true;
    const nodes = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(selector) || [],
    ).slice(0, 200);
    const previous = positions.current;
    const next = new Map<HTMLElement, Position>();
    const animations: Animation[] = [];
    let introduced = 0;
    const beforePositions = new Map<HTMLElement, Position>();
    for (const node of nodes) {
      let before = previous.get(node);
      if (before && active.has(node)) {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        before = {
          left: before.left + matrix.m41,
          top: before.top + matrix.m42,
        };
      }
      if (before) beforePositions.set(node, before);
    }
    // Read interrupted positions together, clear transforms, then measure layout
    // before issuing any new animation writes. Filtering never loops layout/write.
    nodes.forEach(stopMotion);
    const measured = nodes.flatMap((node) => {
      if (!node.getClientRects().length) return [];
      const rect = node.getBoundingClientRect();
      const after = { left: rect.left + scrollX, top: rect.top + scrollY };
      next.set(node, after);
      return [{ node, rect, after, before: beforePositions.get(node) }];
    });
    for (const { node, rect, after, before } of measured) {
      if (rect.bottom < 0 || rect.top > innerHeight || animations.length >= 16)
        continue;
      let animation: Animation | undefined;
      if (before) {
        const x = before.left - after.left,
          y = before.top - after.top;
        if (Math.abs(x) + Math.abs(y) > 1 && Math.abs(y) < innerHeight)
          animation = playMotion(
            node,
            [{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }],
            { duration: motion.travel },
          );
      } else if (canIntroduce) {
        animation = playMotion(
          node,
          [
            { transform: "translateY(5px)", opacity: 0.55 },
            { transform: "none", opacity: 1 },
          ],
          { duration: motion.change, delay: Math.min(introduced++ * 12, 72) },
        );
      }
      if (animation) animations.push(animation);
    }
    positions.current = next;
    for (const node of previous.keys()) if (!next.has(node)) stopMotion(node);
    return () => {
      for (const node of next.keys()) if (!node.isConnected) stopMotion(node);
    };
  }, [itemsKey, ref, selector]);
  useEffect(() => {
    const reset = () => {
      positions.current.clear();
    };
    window.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("resize", reset);
      for (const node of positions.current.keys()) stopMotion(node);
    };
  }, []);
}

export function MotionList({
  as = "div",
  itemsKey,
  itemSelector = ":scope > *",
  children,
  ...props
}: ContainerProps & { itemsKey: string; itemSelector?: string }) {
  const ref = useRef<HTMLElement>(null);
  useListMotion(ref, itemsKey, itemSelector);
  return createElement(as, { ...props, ref }, children);
}

export function useSaveMotion(
  ref: RefObject<HTMLElement | null>,
  status: string,
) {
  const previous = useRef(status);
  useLayoutEffect(() => {
    const changed = previous.current !== status;
    previous.current = status;
    const node = ref.current;
    if (!node || !changed) return;
    const rect = node.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    const animation = playMotion(node, [{ opacity: 0.55 }, { opacity: 1 }], {
      duration: motion.quick,
    });
    const check = node.querySelector<HTMLElement>("svg path");
    const ink = check
      ? playMotion(
          check,
          [{ strokeDashoffset: "32" }, { strokeDashoffset: "0" }],
          { duration: motion.change },
        )
      : undefined;
    return () => {
      animation?.cancel();
      ink?.cancel();
    };
  }, [status, ref]);
}

export function MotionNavigation({
  as = "nav",
  activeKey,
  itemsKey = "",
  selector,
  vertical = false,
  children,
  ...props
}: ContainerProps & {
  activeKey: string;
  itemsKey?: string;
  selector: string;
  vertical?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useListMotion(ref, itemsKey, ":scope > button");
  const marker = useRef<HTMLSpanElement>(null);
  const previous = useRef("");
  useLayoutEffect(() => {
    const container = ref.current,
      track = marker.current;
    if (!container || !track) return;
    const update = (animate: boolean) => {
      const selected = container.querySelector<HTMLElement>(selector);
      if (!selected || !selected.getClientRects().length) {
        track.hidden = true;
        previous.current = "";
        return;
      }
      const parent = container.getBoundingClientRect(),
        child = selected.getBoundingClientRect();
      // The row may still be arriving. Locate its resting edge so the marker
      // cannot retain that temporary translation after the row settles.
      const rowMotion = active.has(selected)
        ? new DOMMatrixReadOnly(getComputedStyle(selected).transform)
        : null;
      const left = child.left - parent.left - (rowMotion?.m41 || 0);
      const top = child.top - parent.top - (rowMotion?.m42 || 0);
      const transform = vertical
        ? `translate(0px, ${top + container.scrollTop + 12}px) scaleY(${Math.max(1, child.height - 24)})`
        : `translate(${left + container.scrollLeft}px, ${top + child.height + container.scrollTop - 2}px) scaleX(${child.width})`;
      if (transform === previous.current && !track.hidden) return;
      const from = active.has(track)
        ? getComputedStyle(track).transform
        : previous.current;
      track.hidden = false;
      track.style.transform = transform;
      if (animate && from)
        playMotion(track, [{ transform: from }, { transform }], {
          duration: motion.travel,
        });
      else stopMotion(track);
      previous.current = transform;
    };
    update(true);
    const observer = new ResizeObserver(() => update(false));
    observer.observe(container);
    const selected = container.querySelector(selector);
    if (selected) observer.observe(selected);
    return () => observer.disconnect();
  }, [activeKey, selector, vertical, children]);
  useEffect(() => {
    const node = marker.current;
    return () => {
      if (node) stopMotion(node);
    };
  }, []);
  return createElement(
    as,
    { ...props, className: `${props.className || ""} motion-navigation`, ref },
    children,
    <span
      key="motion-track"
      ref={marker}
      hidden
      className={`motion-track${vertical ? " motion-track-vertical" : ""}`}
      aria-hidden="true"
    />,
  );
}

export function PlaybackMark({ playing }: { playing: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span
      ref={ref}
      className="playback-mark"
      data-playing={playing && visible}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
    </span>
  );
}

export function useCitationMotion(
  ref: RefObject<HTMLElement | null>,
  locationKey: string,
) {
  useEffect(() => {
    const node = ref.current;
    if (!node || !canAnimate()) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        playMotion(
          node,
          [
            { backgroundColor: "transparent" },
            { backgroundColor: "#f0cd7a", offset: 0.45 },
            { backgroundColor: getComputedStyle(node).backgroundColor },
          ],
          { duration: 600 },
        );
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      stopMotion(node);
    };
  }, [locationKey, ref]);
}

/** Keep each language's identity while the two sides exchange places. */
export function LanguageDirection({
  front,
  back,
  reverse,
}: {
  front: string;
  back: string;
  reverse: boolean;
}) {
  const frontRef = useRef<HTMLSpanElement>(null);
  const backRef = useRef<HTMLSpanElement>(null);
  const positions = useRef<number[]>([]);
  useLayoutEffect(() => {
    const nodes = [frontRef.current, backRef.current];
    const before = nodes.map((node, i) => {
      const left = positions.current[i];
      if (!node || left === undefined || !active.has(node)) return left;
      return left + new DOMMatrixReadOnly(getComputedStyle(node).transform).m41;
    });
    const next = nodes.map((node) => {
      if (!node) return 0;
      stopMotion(node);
      return node.getBoundingClientRect().left;
    });
    nodes.forEach((node, i) => {
      if (!node || before[i] === undefined) return;
      const x = before[i] - next[i];
      if (Math.abs(x) < 1 || Math.abs(x) > 600) return;
      return playMotion(
        node,
        [
          { transform: `translateX(${x}px)` },
          {
            transform: `translate(${x * 0.35}px, ${i === 0 ? -5 : 5}px)`,
            offset: 0.55,
          },
          { transform: "none" },
        ],
        { duration: motion.travel },
      );
    });
    positions.current = next;
  }, [front, back, reverse]);
  useEffect(() => {
    const nodes = [frontRef.current, backRef.current];
    return () =>
      nodes.forEach((node) => {
        if (node) stopMotion(node);
      });
  }, []);
  return (
    <span className="language-direction">
      <span ref={frontRef} style={{ order: reverse ? 2 : 0 }}>
        {front}
      </span>
      <ArrowLeftRight
        size={16}
        aria-hidden="true"
        style={{ order: 1, transform: reverse ? "rotate(180deg)" : "none" }}
      />
      <span ref={backRef} style={{ order: reverse ? 0 : 2 }}>
        {back}
      </span>
    </span>
  );
}
