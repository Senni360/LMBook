export type DockGroup = {
  kind: "group";
  id: string;
  tabs: string[];
  active: string;
};
export type DockSplit = {
  kind: "split";
  id: string;
  axis: "x" | "y";
  ratio: number;
  first: DockNode;
  second: DockNode;
};
export type DockNode = DockGroup | DockSplit;
export type DockSide = "left" | "right" | "top" | "bottom" | "center";
export type DockState = {
  version: 1;
  root: DockNode;
  focused: string;
  closed: string[];
  positions: Record<string, { scroll?: number; filter?: string }>;
};
export const dockKey = "lmbook-ux-lab-sketch-dock-v1";
export const newGroup = (tabs: string[] = []): DockGroup => ({
  kind: "group",
  id: crypto.randomUUID(),
  tabs,
  active: tabs[0] || "",
});
export function initialDock(): DockState {
  const left = newGroup(["notes", "sources"]),
    middle = newGroup(["chat"]),
    right = newGroup(["review", "evidence", "activity"]);
  return {
    version: 1,
    root: {
      kind: "split",
      id: crypto.randomUUID(),
      axis: "x",
      ratio: 0.23,
      first: left,
      second: {
        kind: "split",
        id: crypto.randomUUID(),
        axis: "x",
        ratio: 0.675,
        first: middle,
        second: right,
      },
    },
    focused: middle.id,
    closed: [],
    positions: {},
  };
}
export function groups(node: DockNode): DockGroup[] {
  return node.kind === "group"
    ? [node]
    : [...groups(node.first), ...groups(node.second)];
}
export function mapGroup(
  node: DockNode,
  id: string,
  fn: (group: DockGroup) => DockNode,
): DockNode {
  if (node.kind === "group") return node.id === id ? fn(node) : node;
  return {
    ...node,
    first: mapGroup(node.first, id, fn),
    second: mapGroup(node.second, id, fn),
  };
}
export function removeTab(node: DockNode, tab: string): DockNode {
  if (node.kind === "split")
    return {
      ...node,
      first: removeTab(node.first, tab),
      second: removeTab(node.second, tab),
    };
  const tabs = node.tabs.filter((t) => t !== tab);
  return {
    ...node,
    tabs,
    active: node.active === tab ? tabs.at(-1) || "" : node.active,
  };
}
export function insertTab(
  node: DockNode,
  groupId: string,
  tab: string,
  before?: string,
): DockNode {
  return mapGroup(removeTab(node, tab), groupId, (group) => {
    const tabs = [...group.tabs];
    const at = before ? tabs.indexOf(before) : -1;
    tabs.splice(at < 0 ? tabs.length : at, 0, tab);
    return { ...group, tabs, active: tab };
  });
}
export function splitGroup(
  node: DockNode,
  target: string,
  side: Exclude<DockSide, "center">,
  pane: DockGroup,
): DockNode {
  return mapGroup(node, target, (group) => ({
    kind: "split",
    id: crypto.randomUUID(),
    axis: side === "left" || side === "right" ? "x" : "y",
    ratio: 0.5,
    first: side === "left" || side === "top" ? pane : group,
    second: side === "left" || side === "top" ? group : pane,
  }));
}
export function removeGroup(node: DockNode, id: string): DockNode | null {
  if (node.kind === "group") return node.id === id ? null : node;
  const first = removeGroup(node.first, id),
    second = removeGroup(node.second, id);
  return first && second ? { ...node, first, second } : first || second;
}
export function resizeSplit(
  node: DockNode,
  id: string,
  ratio: number,
): DockNode {
  if (node.kind === "group") return node;
  if (node.id === id)
    return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
  return {
    ...node,
    first: resizeSplit(node.first, id, ratio),
    second: resizeSplit(node.second, id, ratio),
  };
}
export function minimumSize(node: DockNode): { width: number; height: number } {
  if (node.kind === "group") return { width: 220, height: 240 };
  const a = minimumSize(node.first),
    b = minimumSize(node.second);
  return node.axis === "x"
    ? { width: a.width + b.width + 8, height: Math.max(a.height, b.height) }
    : { width: Math.max(a.width, b.width), height: a.height + b.height + 8 };
}
export function restoreDock(validTab: (tab: string) => boolean): DockState {
  const fallback = initialDock();
  try {
    const raw = JSON.parse(localStorage.getItem(dockKey) || "null");
    if (raw?.version !== 1) return fallback;
    const seenTabs = new Set<string>(),
      seenIds = new Set<string>();
    let count = 0;
    const parse = (v: unknown, depth = 0): DockNode => {
      if (!v || typeof v !== "object" || depth > 30 || ++count > 200)
        throw Error("Invalid layout");
      const n = v as Record<string, unknown>;
      const id =
        typeof n.id === "string" && !seenIds.has(n.id)
          ? n.id
          : crypto.randomUUID();
      seenIds.add(id);
      if (n.kind === "group" && Array.isArray(n.tabs)) {
        const tabs = n.tabs.filter(
          (t): t is string =>
            typeof t === "string" &&
            validTab(t) &&
            !seenTabs.has(t) &&
            (seenTabs.add(t), true),
        );
        return {
          kind: "group",
          id,
          tabs,
          active:
            typeof n.active === "string" && tabs.includes(n.active)
              ? n.active
              : tabs[0] || "",
        };
      }
      if (n.kind === "split" && (n.axis === "x" || n.axis === "y"))
        return {
          kind: "split",
          id,
          axis: n.axis,
          ratio: Math.max(0.1, Math.min(0.9, Number(n.ratio) || 0.5)),
          first: parse(n.first, depth + 1),
          second: parse(n.second, depth + 1),
        };
      throw Error("Invalid pane");
    };
    const root = parse(raw.root),
      leaves = groups(root);
    const positions: DockState["positions"] = {};
    if (raw.positions && typeof raw.positions === "object")
      for (const [key, value] of Object.entries(raw.positions)) {
        if (!value || typeof value !== "object") continue;
        const p = value as Record<string, unknown>;
        positions[key] = {
          scroll: typeof p.scroll === "number" ? Math.max(0, p.scroll) : 0,
          filter: typeof p.filter === "string" ? p.filter : "",
        };
      }
    return {
      version: 1,
      root,
      focused: leaves.some((g) => g.id === raw.focused)
        ? raw.focused
        : leaves[0].id,
      closed: Array.isArray(raw.closed)
        ? raw.closed.filter(
            (t: unknown): t is string => typeof t === "string" && validTab(t),
          )
        : [],
      positions,
    };
  } catch {
    return fallback;
  }
}
