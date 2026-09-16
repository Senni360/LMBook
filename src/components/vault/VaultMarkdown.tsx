import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Root } from "mdast";
import {
  createVaultLinkResolver,
  inspectVaultMarkdown,
  type VaultLinkFile,
  type VaultLinkResolver,
} from "../../../shared/vault-markdown";
import { InkButton, InkLink } from "../InkControl";
import "./vault-markdown.css";

export type VaultMarkdownProps = {
  text: string;
  notePath: string;
  vaultId: string;
  files: VaultLinkFile[];
  anchor?: string;
  onOpenNote: (path: string, anchor?: string) => void;
  onMissingNote?: (path: string) => void;
};

type SyntaxNode = {
  type?: string;
  value?: string;
  url?: string;
  alt?: string;
  children?: SyntaxNode[];
  data?: Record<string, unknown>;
};

function targetData(target: string, embed = false) {
  return {
    hProperties: {
      "data-vault-target": target,
      "data-vault-format": "wiki",
      ...(embed ? { "data-vault-embed": "true" } : {}),
    },
  };
}

function splitWikiText(value: string): SyntaxNode[] | null {
  const expression = /(!)?\[\[([^\]\n]+)\]\]/g;
  const nodes: SyntaxNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value))) {
    if (match.index > cursor)
      nodes.push({ type: "text", value: value.slice(cursor, match.index) });
    const raw = match[2].trim();
    const [destination, label] = raw.split("|", 2);
    const target = destination.trim();
    if (!target) {
      nodes.push({ type: "text", value: match[0] });
    } else if (match[1]) {
      nodes.push({
        type: "image",
        url: target,
        alt: (label || target.split("#")[0]).trim(),
        data: targetData(target, true),
      });
    } else {
      nodes.push({
        type: "link",
        url: target,
        children: [{ type: "text", value: (label || target).trim() }],
        data: targetData(target),
      });
    }
    cursor = match.index + match[0].length;
  }
  if (!nodes.length) return null;
  if (cursor < value.length)
    nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

function remarkVaultSyntax() {
  return (tree: Root) => {
    const transform = (parent: SyntaxNode) => {
      if (!parent.children || parent.type === "link" || parent.type === "image")
        return;
      const next: SyntaxNode[] = [];
      for (const child of parent.children) {
        if (child.type === "text" && child.value)
          next.push(...(splitWikiText(child.value) || [child]));
        else {
          next.push(child);
          if (child.type !== "code" && child.type !== "html") transform(child);
        }
      }
      parent.children = next;
    };
    transform(tree as unknown as SyntaxNode);
  };
}

function remarkVaultCallouts() {
  return (tree: Root) => {
    const transform = (node: SyntaxNode) => {
      if (
        node.type === "blockquote" &&
        node.children?.[0]?.type === "paragraph"
      ) {
        const first = node.children[0].children?.[0];
        const value = first?.value || "";
        const match = value.match(/^\[!([a-z][\w-]*)\]\s*/i);
        if (match && first) {
          first.value = value.slice(match[0].length);
          node.data = {
            ...(node.data || {}),
            hProperties: {
              className: [
                "vault-callout",
                `vault-callout-${match[1].toLocaleLowerCase()}`,
              ],
              "data-callout-type": match[1].toLocaleLowerCase(),
            },
          };
        }
      }
      for (const child of node.children || []) transform(child);
    };
    transform(tree as unknown as SyntaxNode);
  };
}

function lineFor(
  node: SyntaxNode & { position?: { start?: { line?: number } } },
) {
  return node.position?.start?.line || 0;
}

function hrefData(node: SyntaxNode & { properties?: Record<string, unknown> }) {
  const properties = node.properties || {};
  const target = properties["data-vault-target"] || properties.dataVaultTarget;
  return typeof target === "string" ? target : undefined;
}

function anchorId(value: string) {
  return value.replace(/^#/, "").trim();
}

function isImagePath(path: string) {
  return /\.(?:png|jpe?g|gif|webp|avif)$/i.test(path);
}

function ResolvedLink({
  children,
  target,
  notePath,
  vaultId,
  resolver,
  onOpenNote,
  onMissingNote,
}: {
  children: ReactNode;
  target: string;
  notePath: string;
  vaultId: string;
  resolver: VaultLinkResolver;
  onOpenNote: (path: string, anchor?: string) => void;
  onMissingNote?: (path: string) => void;
}) {
  const [showMatches, setShowMatches] = useState(false);
  const resolution = resolver(target, notePath, "wiki");
  const open = (path: string, anchor?: string) => onOpenNote(path, anchor);
  if (resolution.kind === "external")
    return (
      <InkLink
        className="vault-markdown-link"
        href={resolution.url}
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </InkLink>
    );
  if (resolution.kind === "note")
    return (
      <InkLink
        className="vault-markdown-link"
        href={`#${resolution.anchor || ""}`}
        onClick={(event) => {
          event.preventDefault();
          open(resolution.path, resolution.anchor);
        }}
      >
        {children}
      </InkLink>
    );
  if (resolution.kind === "asset" && isImagePath(resolution.path))
    return (
      <InkLink
        className="vault-markdown-link"
        href={`/api/vaults/${encodeURIComponent(vaultId)}/asset?path=${encodeURIComponent(resolution.path)}`}
        target="_blank"
        rel="noreferrer"
      >
        {children}
      </InkLink>
    );
  if (resolution.kind === "ambiguous")
    return (
      <span className="vault-markdown-ambiguous">
        <InkButton
          className="vault-markdown-link"
          aria-expanded={showMatches}
          onClick={() => setShowMatches((value) => !value)}
        >
          {children}
        </InkButton>
        {showMatches && (
          <span
            className="vault-markdown-match-list"
            role="listbox"
            aria-label="Matching notes"
          >
            {resolution.matches.map((path) => (
              <InkButton
                className="button quiet"
                role="option"
                key={path}
                onClick={() => open(path, resolution.anchor)}
              >
                {path}
              </InkButton>
            ))}
          </span>
        )}
      </span>
    );
  if (
    resolution.kind === "missing" &&
    resolution.reason === "unsupported-scheme"
  )
    return (
      <span
        className="vault-markdown-blocked-link"
        title="This link scheme is not allowed in LMBook"
        role="note"
      >
        {children} <small>(unsupported link scheme)</small>
      </span>
    );
  const missing = resolution.path || target;
  return (
    <InkButton
      className="vault-markdown-link vault-markdown-missing"
      title="This note is not in the connected vault"
      onClick={() => onMissingNote?.(missing)}
    >
      {children}
    </InkButton>
  );
}

function ImageEmbed({
  src,
  alt,
  target,
  notePath,
  vaultId,
  resolver,
  onOpenNote,
  onMissingNote,
}: {
  src?: string;
  alt?: string;
  target?: string;
  notePath: string;
  vaultId: string;
  resolver: VaultLinkResolver;
  onOpenNote: (path: string, anchor?: string) => void;
  onMissingNote?: (path: string) => void;
}) {
  const wanted = target || src || "";
  const resolution = resolver(wanted, notePath, target ? "wiki" : "markdown");
  if (resolution.kind === "note")
    return (
      <figure className="vault-markdown-embed vault-markdown-note-embed">
        <figcaption>{alt || resolution.path}</figcaption>
        <InkButton
          className="button quiet"
          onClick={() => onOpenNote(resolution.path, resolution.anchor)}
        >
          Open note
        </InkButton>
      </figure>
    );
  if (resolution.kind === "asset" && isImagePath(resolution.path))
    return (
      <figure className="vault-markdown-embed">
        <img
          src={`/api/vaults/${encodeURIComponent(vaultId)}/asset?path=${encodeURIComponent(resolution.path)}`}
          alt={alt || resolution.path}
          loading="lazy"
          decoding="async"
        />
        {alt && <figcaption>{alt}</figcaption>}
      </figure>
    );
  if (resolution.kind === "external")
    return (
      <p className="vault-markdown-embed-state">
        Remote image blocked. Add it to this vault to display it.
      </p>
    );
  if (resolution.kind === "ambiguous")
    return (
      <div className="vault-markdown-embed-state">
        <span>Embed has multiple possible files.</span>
        <span
          className="vault-markdown-match-list"
          role="listbox"
          aria-label="Matching embed files"
        >
          {resolution.matches.map((path) => (
            <InkButton
              className="button quiet"
              role="option"
              key={path}
              onClick={() => onOpenNote(path, resolution.anchor)}
            >
              {path}
            </InkButton>
          ))}
        </span>
      </div>
    );
  if (resolution.kind === "asset")
    return (
      <p className="vault-markdown-embed-state">
        This embed type is preserved but not rendered: {resolution.path}
      </p>
    );
  return (
    <p className="vault-markdown-embed-state">
      Embed not found: {resolution.path || wanted}
    </p>
  );
}

function MarkdownHeading({
  level,
  children,
  id,
}: {
  level: number;
  children: ReactNode;
  id?: string;
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <Tag id={id} tabIndex={id ? -1 : undefined}>
      {children}
    </Tag>
  );
}

export function VaultMarkdown({
  text,
  notePath,
  vaultId,
  files,
  anchor,
  onOpenNote,
  onMissingNote,
}: VaultMarkdownProps) {
  const article = useRef<HTMLElement>(null);
  const inspection = useMemo(() => inspectVaultMarkdown(text), [text]);
  const linkResolver = useMemo(() => createVaultLinkResolver(files), [files]);
  const bodyLineOffset = inspection.frontmatter
    ? inspection.frontmatter.split(/\r?\n/).length
    : 0;
  const headingByLine = useMemo(
    () =>
      new Map(
        inspection.headings.map((heading) => [
          heading.line - bodyLineOffset,
          heading,
        ]),
      ),
    [bodyLineOffset, inspection.headings],
  );
  useEffect(() => {
    if (!anchor) return;
    const id = anchorId(anchor);
    const node = article.current?.querySelector<HTMLElement>(
      `#${CSS.escape(id)}`,
    );
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
      node.focus({ preventScroll: true });
    });
  }, [anchor, inspection.body]);

  const renderHeading = (level: number, children: ReactNode, node: unknown) => {
    const heading = headingByLine.get(
      lineFor(
        node as SyntaxNode & { position?: { start?: { line?: number } } },
      ),
    );
    return (
      <MarkdownHeading level={level} id={heading?.id}>
        {children}
      </MarkdownHeading>
    );
  };
  const components: Components = {
    h1: ({ children, node }) => renderHeading(1, children, node),
    h2: ({ children, node }) => renderHeading(2, children, node),
    h3: ({ children, node }) => renderHeading(3, children, node),
    h4: ({ children, node }) => renderHeading(4, children, node),
    h5: ({ children, node }) => renderHeading(5, children, node),
    h6: ({ children, node }) => renderHeading(6, children, node),
    a: ({ children, node }) => {
      const properties =
        (node as unknown as { properties?: Record<string, unknown> })
          .properties || {};
      const target =
        hrefData(
          node as unknown as SyntaxNode & {
            properties?: Record<string, unknown>;
          },
        ) || String(properties.href || "");
      return (
        <ResolvedLink
          target={target}
          notePath={notePath}
          vaultId={vaultId}
          resolver={linkResolver}
          onOpenNote={onOpenNote}
          onMissingNote={onMissingNote}
        >
          {children}
        </ResolvedLink>
      );
    },
    img: ({ src, alt, node }) => {
      const properties =
        (node as unknown as { properties?: Record<string, unknown> })
          .properties || {};
      const target =
        typeof properties["data-vault-target"] === "string"
          ? properties["data-vault-target"]
          : undefined;
      return (
        <ImageEmbed
          src={src}
          alt={alt}
          target={target}
          notePath={notePath}
          vaultId={vaultId}
          resolver={linkResolver}
          onOpenNote={onOpenNote}
          onMissingNote={onMissingNote}
        />
      );
    },
    blockquote: ({ children, node }) => {
      const properties =
        (node as unknown as { properties?: Record<string, unknown> })
          .properties || {};
      const rawCallout =
        properties["data-callout-type"] || properties.dataCalloutType;
      const callout = typeof rawCallout === "string" ? rawCallout : "";
      return (
        <blockquote className={callout ? "vault-callout" : undefined}>
          {callout && (
            <span className="vault-callout-label">{String(callout)}</span>
          )}
          {children}
        </blockquote>
      );
    },
    pre: ({ children }) => (
      <pre className="vault-markdown-code-block">
        <span className="vault-markdown-code-label">Code block</span>
        {children}
      </pre>
    ),
    code: ({ children, className }) => {
      const language = className?.match(/language-([\w+-]+)/)?.[1];
      return (
        <code className={className} data-language={language || undefined}>
          {children}
        </code>
      );
    },
    table: ({ children }) => (
      <div className="vault-markdown-table-wrap">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <article
      className="vault-markdown"
      ref={article}
      aria-label={notePath || "Markdown note"}
    >
      <div className="vault-markdown-body">
        <ReactMarkdown
          remarkPlugins={[
            remarkGfm,
            remarkFrontmatter,
            remarkVaultSyntax,
            remarkVaultCallouts,
          ]}
          skipHtml
          urlTransform={(url) => url}
          components={components}
        >
          {inspection.body}
        </ReactMarkdown>
      </div>
    </article>
  );
}
