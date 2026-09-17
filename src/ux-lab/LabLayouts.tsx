import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { InkButton as Button } from "../components/InkControl";
import "./lab-layouts.css";

export type LabPanel = "material" | "work" | "context";
export type LabLayoutProps = {
  direction: number;
  navigation: ReactNode;
  workspace: ReactNode;
  context: ReactNode;
  overview: ReactNode;
  activityNav: ReactNode;
  tabs: ReactNode;
  signature: ReactNode;
  focus: boolean;
  onFocus: () => void;
  reader?: ReactNode;
  task?: string;
  activePanel?: LabPanel;
  onPanelChange?: (panel: LabPanel) => void;
};
export const directionNames = [
  "balanced3panes",
  "focusedcentral",
  "notebookactivitytabs",
  "documentmargin",
  "studysession",
  "researchcomparison",
  "topicoutline",
  "mixedtabssplits",
  "notebookoverview",
  "readeractivitysplit",
];
type Size = {
  left: number;
  right: number;
  lower: number;
  inner: number;
  hideMaterial: boolean;
  hideContext: boolean;
  split: boolean;
  stacked: boolean;
};
function initial(direction: number): Size {
  const base: Size = {
    left: 21,
    right: 27,
    lower: 48,
    inner: 50,
    hideMaterial: [2, 5, 9, 10].includes(direction),
    hideContext: [2, 5, 6, 9, 10].includes(direction),
    split: false,
    stacked: false,
  };
  try {
    const v = JSON.parse(
      localStorage.getItem(`lmbook-ux-lab-layout-${direction}`) || "null",
    );
    if (v && typeof v === "object")
      return {
        ...base,
        left: Math.min(34, Math.max(15, Number(v.left) || 21)),
        right: Math.min(34, Math.max(18, Number(v.right) || 27)),
        lower: Math.min(70, Math.max(30, Number(v.lower) || 48)),
        inner: Math.min(70, Math.max(30, Number(v.inner) || 50)),
        hideMaterial:
          typeof v.hideMaterial === "boolean"
            ? v.hideMaterial
            : base.hideMaterial,
        hideContext:
          typeof v.hideContext === "boolean" ? v.hideContext : base.hideContext,
        split: v.split === true,
        stacked: v.stacked === true,
      };
  } catch {}
  return base;
}
function Separator({
  axis,
  value,
  onChange,
  label,
  minimum,
  maximum,
}: {
  axis: "x" | "y";
  value: number;
  onChange: (n: number) => void;
  label: string;
  minimum?: number;
  maximum?: number;
}) {
  const min = minimum ?? (axis === "x" ? 15 : 30);
  const max = maximum ?? (axis === "x" ? 34 : 70);
  const drag = useRef<{
    coordinate: number;
    value: number;
    size: number;
  } | null>(null);
  return (
    <div
      className={`lab-divider lab-divider-${axis}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onDoubleClick={() => onChange((min + max) / 2)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const box = e.currentTarget.parentElement!.getBoundingClientRect();
        drag.current = {
          coordinate: axis === "x" ? e.clientX : e.clientY,
          value,
          size: axis === "x" ? box.width : box.height,
        };
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onChange(
            drag.current.value +
              (((axis === "x" ? e.clientX : e.clientY) -
                drag.current.coordinate) /
                drag.current.size) *
                100,
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
            "Enter",
          ].includes(e.key)
        ) {
          e.preventDefault();
          onChange(
            e.key === "Home"
              ? min
              : e.key === "End"
                ? max
                : e.key === "Enter"
                  ? (min + max) / 2
                  : value + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -2 : 2),
          );
        }
      }}
    />
  );
}
export function LabLayout(p: LabLayoutProps) {
  const [size, setSize] = useState(() => initial(p.direction));
  useEffect(() => {
    const restore = () => setSize(initial(p.direction));
    window.addEventListener("lmbook-ux-lab-restore-layout", restore);
    return () =>
      window.removeEventListener("lmbook-ux-lab-restore-layout", restore);
  }, [p.direction]);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    try {
      localStorage.setItem(
        `lmbook-ux-lab-layout-${p.direction}`,
        JSON.stringify(size),
      );
    } catch {}
  }, [p.direction, size]);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 900px)");
    const change = () => setNarrow(q.matches);
    q.addEventListener("change", change);
    return () => q.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (p.activePanel === "context")
      setSize((s) => ({ ...s, hideContext: false }));
  }, [p.activePanel]);
  const setAxis = (key: "left" | "right" | "lower" | "inner", n: number) =>
    setSize((s) => ({
      ...s,
      [key]: Math.min(
        key === "lower" || key === "inner" ? 70 : 34,
        Math.max(key === "lower" || key === "inner" ? 30 : 15, n),
      ),
    }));
  const materialVisible = !size.hideMaterial && !p.focus;
  const contextVisible = !size.hideContext && !p.focus;
  const style = {
    "--lab-left": `${size.left}%`,
    "--lab-right": `${size.right}%`,
    "--lab-lower": `${size.lower}%`,
    "--lab-inner": `${size.inner}%`,
    "--lab-material-size": materialVisible ? `${size.left}%` : "0px",
    "--lab-context-size": contextVisible ? `${size.right}%` : "0px",
  } as CSSProperties;
  const left = materialVisible ? (
    <aside className="lab-material-region">{p.navigation}</aside>
  ) : null;
  const right = contextVisible ? (
    <aside className="lab-context-region">{p.context}</aside>
  ) : null;
  const ls = materialVisible ? (
    <Separator
      axis="x"
      value={size.left}
      onChange={(n) => setAxis("left", n)}
      label="Resize material pane"
    />
  ) : null;
  const rs = contextVisible ? (
    <Separator
      axis="x"
      value={size.right}
      onChange={(n) => setAxis("right", size.right + (size.right - n))}
      label="Resize context pane"
    />
  ) : null;
  const main = (
    <div className="lab-working-region">
      {p.tabs}
      {p.workspace}
    </div>
  );
  let composition: ReactNode;
  if (narrow) {
    const panel = p.activePanel || "work";
    composition = (
      <>
        <nav className="lab-mobile-navigation" aria-label="Workspace panes">
          {(
            [
              ["material", "Material"],
              ["work", "Work"],
              ["context", "Review & ideas"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              aria-pressed={panel === key}
              onClick={() => p.onPanelChange?.(key)}
            >
              {label}
            </Button>
          ))}
        </nav>
        <div className="lab-mobile-view">
          {panel === "material" ? (
            <>
              {p.navigation}
              {p.direction === 10 && p.reader}
            </>
          ) : panel === "context" ? (
            <>
              {p.signature}
              {p.context}
            </>
          ) : (
            <>
              {p.tabs}
              {p.workspace}
            </>
          )}
        </div>
      </>
    );
  } else if (p.direction === 2) {
    composition = (
      <div className="lab-composition lab-focus-composition">
        {left}
        {ls}
        <div className="lab-focus-paper">
          {main}
          {p.signature}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 3) {
    composition = (
      <div className="lab-composition lab-tabbed-composition">
        {left}
        {ls}
        <div className="lab-notebook-sheet">
          {main}
          {p.signature}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 4) {
    composition = (
      <div className="lab-composition lab-document-composition">
        {left}
        {ls}
        <div className="lab-writing-paper">{main}</div>
        {rs}
        <aside className="lab-margin-region">
          {p.signature}
          {right}
        </aside>
      </div>
    );
  } else if (p.direction === 5) {
    composition = (
      <div className="lab-composition lab-study-composition">
        {left}
        {ls}
        <div className="lab-study-stage">
          {p.task === "home" ? p.overview : main}
          {p.signature}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 6) {
    composition = (
      <div className="lab-composition lab-research-composition">
        {left}
        {ls}
        <div className="lab-research-desk">
          <div className="lab-research-pair">
            <section aria-label="Source for comparison">{p.reader}</section>
            <section aria-label="Working note">{main}</section>
          </div>
          {p.signature}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 7) {
    composition = (
      <div className="lab-composition lab-outline-composition">
        {left}
        {ls}
        <div className="lab-topic-paper">
          {p.signature}
          {main}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 8) {
    composition = (
      <div className="lab-composition lab-tabs-composition">
        {left}
        {ls}
        <div className="lab-tab-workspace">
          {p.tabs}
          <div className="lab-split-actions">
            <Button
              aria-pressed={size.split}
              onClick={() => setSize((s) => ({ ...s, split: !s.split }))}
            >
              {size.split ? "Close second view" : "Open source beside"}
            </Button>
            {size.split && (
              <Button
                onClick={() => setSize((s) => ({ ...s, stacked: !s.stacked }))}
              >
                {size.stacked ? "Side by side" : "Stack vertically"}
              </Button>
            )}
          </div>
          <div
            className={`lab-tab-split ${size.split ? "has-split" : ""} ${size.stacked ? "stacked" : ""}`}
          >
            <div>{p.workspace}</div>
            {size.split && (
              <>
                <Separator
                  axis={size.stacked ? "y" : "x"}
                  value={size.stacked ? size.lower : size.inner}
                  minimum={30}
                  maximum={70}
                  onChange={(n) => setAxis(size.stacked ? "lower" : "inner", n)}
                  label="Resize second view"
                />
                <div>{p.reader}</div>
              </>
            )}
          </div>
          {p.signature}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 9) {
    composition = (
      <div className="lab-composition lab-overview-composition">
        {left}
        {ls}
        <div className="lab-overview-page">
          {p.task === "home" ? p.overview : main}
          {p.signature}
        </div>
        {rs}
        {right}
      </div>
    );
  } else if (p.direction === 10) {
    composition = (
      <div className="lab-reading-composition">
        {materialVisible && (
          <div className="lab-reader-browser">{p.navigation}</div>
        )}
        <div className="lab-reading-pair">
          <section aria-label="Reading material">{p.reader}</section>
          <Separator
            axis="x"
            value={size.inner}
            minimum={30}
            maximum={70}
            onChange={(n) => setAxis("inner", n)}
            label="Resize reading area"
          />
          <section aria-label="Learning activity">{p.workspace}</section>
        </div>
        <div className="lab-reading-support">
          {p.signature}
          {right}
        </div>
      </div>
    );
  } else {
    composition = (
      <div className="lab-composition lab-balanced-composition">
        {left}
        {ls}
        {main}
        {rs}
        <aside className="lab-balanced-support">
          {p.signature}
          {right}
        </aside>
      </div>
    );
  }
  return (
    <main
      className={`lab-layout ux-lab-${directionNames[p.direction - 1]} ${p.focus ? "is-focused" : ""} ${materialVisible ? "has-material" : ""} ${contextVisible ? "has-context" : ""}`}
      style={style}
    >
      <div className="lab-layout-top">
        {p.activityNav}
        <div className="lab-toolstrip">
          <Button
            aria-pressed={materialVisible}
            onClick={() => {
              if (p.focus) p.onFocus();
              setSize((s) => ({ ...s, hideMaterial: !s.hideMaterial }));
              if (narrow) p.onPanelChange?.("material");
            }}
          >
            Material
          </Button>
          <Button
            aria-pressed={contextVisible}
            onClick={() => {
              if (p.focus) p.onFocus();
              setSize((s) => ({ ...s, hideContext: !s.hideContext }));
              if (narrow) p.onPanelChange?.("context");
            }}
          >
            Review
          </Button>
          <Button aria-pressed={p.focus} onClick={p.onFocus}>
            {p.focus ? "Exit focus" : "Focus"}
          </Button>
          <Button
            onClick={() => {
              try {
                localStorage.removeItem(`lmbook-ux-lab-layout-${p.direction}`);
              } catch {}
              setSize(initial(p.direction));
              if (p.focus) p.onFocus();
            }}
          >
            Reset layout
          </Button>
        </div>
      </div>
      {composition}
    </main>
  );
}
