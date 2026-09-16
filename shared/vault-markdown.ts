import { unified } from "unified";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import YAML from "yaml";
import type { Root, RootContent } from "mdast";

export type VaultHeading = {
  id: string;
  text: string;
  level: number;
  line: number;
};

export type VaultLink = {
  target: string;
  label: string;
  embed: boolean;
  format: "wiki" | "markdown";
  line: number;
};

export type VaultMarkdownInspection = {
  title: string;
  aliases: string[];
  tags: string[];
  headings: VaultHeading[];
  links: VaultLink[];
  properties: Record<string, unknown>;
  body: string;
  frontmatter: string;
};

export type VaultLinkFile = {
  path: string;
  aliases?: string[];
};

export type VaultLinkResolution =
  | { kind: "external"; url: string; anchor?: string }
  | { kind: "missing"; path: string; anchor?: string; reason?: string }
  | { kind: "ambiguous"; matches: string[]; anchor?: string }
  | { kind: "note" | "asset"; path: string; anchor?: string };

const MAX_ALIASES = 64;
const MAX_TAGS = 256;
const MAX_YAML_ALIASES = 32;
const markdownProcessor = unified().use(remarkParse).use(remarkFrontmatter);

function nodeText(
  node: RootContent | { children?: unknown[]; value?: string },
): string {
  if (typeof (node as { value?: unknown }).value === "string")
    return (node as { value: string }).value;
  const children = (node as { children?: unknown[] }).children;
  return Array.isArray(children)
    ? children
        .map((child) =>
          child && typeof child === "object"
            ? nodeText(child as { children?: unknown[]; value?: string })
            : "",
        )
        .join("")
    : "";
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .replace(/[\s-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function yamlValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : String(value);
  if (typeof value !== "object") return String(value);
  if (depth > 24 || seen.has(value)) return "[Circular YAML reference]";
  seen.add(value);
  if (Array.isArray(value))
    return value.slice(0, 256).map((item) => yamlValue(item, seen, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    ).slice(0, 256))
      result[key] = yamlValue(child, seen, depth + 1);
    return result;
  }
  return "[Unsupported YAML value]";
}

function asStrings(value: unknown, limit: number) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter(
      (item): item is string | number =>
        typeof item === "string" || typeof item === "number",
    )
    .map(String)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function frontmatterFor(ast: Root, text: string) {
  const first = ast.children[0];
  if (!first || first.type !== "yaml" || !first.position) return null;
  const start = first.position.start.offset ?? 0;
  const end = first.position.end.offset ?? start;
  const raw = text.slice(start, end);
  let properties: Record<string, unknown> = {};
  try {
    const document = YAML.parseDocument(first.value, {
      schema: "core",
      strict: true,
      stringKeys: true,
    });
    if (!document.errors.length) {
      const parsed = yamlValue(
        document.toJS({ maxAliasCount: MAX_YAML_ALIASES }),
      );
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        properties = parsed as Record<string, unknown>;
    }
  } catch {
    properties = {};
  }
  return { raw, end, properties };
}

function addTag(tags: string[], value: string) {
  const tag = value.replace(/^#/, "").trim();
  if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) tags.push(tag);
}

function discoverText(
  value: string,
  tags: string[],
  links: VaultLink[],
  line: number,
) {
  const wiki = /(!)?\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = wiki.exec(value))) {
    const raw = match[2].trim();
    const [destination, label] = raw.split("|", 2);
    const target = destination.trim();
    if (target)
      links.push({
        target,
        label: (label || target.split("#")[0]).trim(),
        embed: match[1] === "!",
        format: "wiki",
        line,
      });
  }
  const tag = /(?:^|[\s(])#([\p{Letter}\p{Number}_/-]+)/gu;
  while ((match = tag.exec(value))) addTag(tags, match[1]);
}

function walk(
  node: RootContent,
  tags: string[],
  links: VaultLink[],
  headings: VaultHeading[],
  seenHeadingIds: Map<string, number>,
) {
  if (node.type === "code" || node.type === "yaml" || node.type === "html")
    return;
  const line = node.position?.start.line || 1;
  if (node.type === "heading") {
    const headingText = nodeText(node).trim();
    const base = slugify(headingText);
    const count = (seenHeadingIds.get(base) || 0) + 1;
    seenHeadingIds.set(base, count);
    headings.push({
      id: count === 1 ? base : `${base}-${count}`,
      text: headingText,
      level: node.depth,
      line,
    });
  }
  if (node.type === "link" || node.type === "image") {
    links.push({
      target: node.url,
      label:
        node.type === "image"
          ? node.alt || node.url
          : nodeText(node).trim() || node.url,
      embed: node.type === "image",
      format: "markdown",
      line,
    });
    if (node.type === "image") return;
  }
  if (node.type === "text") discoverText(node.value, tags, links, line);
  if ("children" in node && Array.isArray(node.children))
    for (const child of node.children)
      walk(child, tags, links, headings, seenHeadingIds);
}

function splitTarget(target: string, format: "wiki" | "markdown") {
  let value = target.trim();
  if (format === "wiki") value = value.split("|", 1)[0].trim();
  const hash = value.indexOf("#");
  const rawPath = hash === -1 ? value : value.slice(0, hash);
  const anchor =
    hash === -1 ? undefined : value.slice(hash + 1).trim() || undefined;
  try {
    return { path: decodeURIComponent(rawPath), anchor };
  } catch {
    return { path: rawPath, anchor };
  }
}

function cleanPath(path: string, fromPath: string, rootRelative: boolean) {
  const input = path.replaceAll("\\", "/").trim();
  const parts = (
    rootRelative ? [] : fromPath.replaceAll("\\", "/").split("/").slice(0, -1)
  ).filter(Boolean);
  let escaped = false;
  for (const part of input.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) escaped = true;
      else parts.pop();
    } else parts.push(part);
  }
  if (escaped) return null;
  return parts.join("/");
}

function basename(path: string) {
  return path.split("/").at(-1) || path;
}

function isNote(path: string) {
  return /\.(?:md|markdown)$/i.test(path);
}

function externalScheme(target: string) {
  const match = target.trim().match(/^([a-z][a-z\d+.-]*):/i);
  return match?.[1].toLocaleLowerCase();
}

function isAllowedExternal(target: string) {
  return ["http", "https", "mailto"].includes(externalScheme(target) || "");
}

export function inspectVaultMarkdown(text: string): VaultMarkdownInspection {
  let ast: Root;
  try {
    ast = markdownProcessor.parse(text) as Root;
  } catch {
    ast = { type: "root", children: [] };
  }
  const frontmatter = frontmatterFor(ast, text);
  const tags = asStrings(frontmatter?.properties.tags, MAX_TAGS).map((tag) =>
    tag.replace(/^#/, ""),
  );
  const aliases = asStrings(
    frontmatter?.properties.aliases ?? frontmatter?.properties.alias,
    MAX_ALIASES,
  );
  const headings: VaultHeading[] = [];
  const links: VaultLink[] = [];
  const seenHeadingIds = new Map<string, number>();
  for (const child of ast.children) {
    if (frontmatter && child === ast.children[0]) continue;
    walk(child, tags, links, headings, seenHeadingIds);
  }
  const titleProperty = frontmatter?.properties.title;
  const title =
    typeof titleProperty === "string" && titleProperty.trim()
      ? titleProperty.trim()
      : headings[0]?.text || "";
  const body = frontmatter
    ? text.slice(frontmatter.end).replace(/^\r?\n/, "")
    : text;
  return {
    title,
    aliases: [...new Set(aliases)],
    tags: [...new Set(tags)],
    headings,
    links,
    properties: frontmatter?.properties || {},
    body,
    frontmatter: frontmatter?.raw || "",
  };
}

export function resolveVaultLink(
  target: string,
  fromPath: string,
  files: VaultLinkFile[],
  format: "wiki" | "markdown" = "wiki",
): VaultLinkResolution {
  return createVaultLinkResolver(files)(target, fromPath, format);
}

type IndexedVaultFile = {
  file: VaultLinkFile;
  order: number;
  path: string;
  lowerPath: string;
  lowerBasename: string;
  lowerAliases: string[];
};

export type VaultLinkResolver = (
  target: string,
  fromPath: string,
  format?: "wiki" | "markdown",
) => VaultLinkResolution;

function addIndex(
  index: Map<string, IndexedVaultFile[]>,
  key: string,
  value: IndexedVaultFile,
) {
  const values = index.get(key);
  if (values) values.push(value);
  else index.set(key, [value]);
}

export function createVaultLinkResolver(
  files: VaultLinkFile[],
): VaultLinkResolver {
  const indexed = files.map<IndexedVaultFile>((file, order) => {
    const path = file.path.replaceAll("\\", "/").replace(/^\/+/, "");
    return {
      file,
      order,
      path,
      lowerPath: path.toLocaleLowerCase(),
      lowerBasename: basename(path).toLocaleLowerCase(),
      lowerAliases: (file.aliases || []).map((alias) =>
        alias.trim().toLocaleLowerCase(),
      ),
    };
  });
  const exactIndex = new Map<string, IndexedVaultFile[]>();
  const basenameIndex = new Map<string, IndexedVaultFile[]>();
  const aliasIndex = new Map<string, IndexedVaultFile[]>();
  for (const entry of indexed) {
    addIndex(exactIndex, entry.lowerPath, entry);
    addIndex(basenameIndex, entry.lowerBasename, entry);
    for (const alias of entry.lowerAliases)
      if (alias) addIndex(aliasIndex, alias, entry);
  }

  return (target, fromPath, format = "wiki") => {
    const raw = target.trim();
    if (isAllowedExternal(raw)) return { kind: "external", url: raw };
    if (externalScheme(raw) || raw.startsWith("//"))
      return {
        kind: "missing",
        path: raw,
        reason: "unsupported-scheme",
      };
    const { path: requested, anchor } = splitTarget(raw, format);
    const directCurrent = !requested.trim();
    const requestedPath = directCurrent ? fromPath : requested.trim();
    const explicitRelative = /^(?:\.\/|\.\.\/)/.test(requestedPath);
    const rootRelative =
      requestedPath.startsWith("/") ||
      (format === "wiki" && !explicitRelative && !directCurrent);
    const clean = directCurrent
      ? cleanPath(fromPath, "", true)
      : cleanPath(requestedPath, fromPath, rootRelative);
    if (clean === null)
      return {
        kind: "missing",
        path: requestedPath.replace(/^\/+/, ""),
        anchor,
      };
    const normalized = clean.replace(/^\/+/, "");
    const lower = normalized.toLocaleLowerCase();
    const withExtension = /\.[^/]+$/.test(normalized)
      ? normalized
      : `${normalized}.md`;
    const exact = [
      ...(exactIndex.get(lower) || []),
      ...(exactIndex.get(withExtension.toLocaleLowerCase()) || []),
    ];
    let matches = exact;
    if (!matches.length && format === "wiki") {
      const base = basename(withExtension).toLocaleLowerCase();
      matches = [
        ...(basenameIndex.get(base) || []),
        ...(aliasIndex.get(normalized.toLocaleLowerCase()) || []),
        ...(aliasIndex.get(basename(normalized).toLocaleLowerCase()) || []),
      ];
    }
    const unique = [
      ...new Map(matches.map((entry) => [entry.file.path, entry])).values(),
    ].sort((a, b) => a.order - b.order);
    if (unique.length > 1)
      return {
        kind: "ambiguous",
        matches: unique.map((entry) => entry.file.path),
        anchor,
      };
    if (!unique.length)
      return { kind: "missing", path: normalized || requestedPath, anchor };
    const path = unique[0].path;
    return isNote(path)
      ? { kind: "note", path, anchor }
      : { kind: "asset", path, anchor };
  };
}
