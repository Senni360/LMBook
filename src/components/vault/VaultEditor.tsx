import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
} from "@codemirror/state";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  search,
  searchKeymap,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  autocompletion,
  completionKeymap,
  type Completion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import {
  defaultHighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  type Panel,
  type ViewUpdate,
} from "@codemirror/view";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import "./vault-editor.css";

export type VaultEditorFile = { path: string };

export type VaultEditorProps = {
  documentKey: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  readOnly?: boolean;
  files?: VaultEditorFile[];
  autofocus?: boolean;
  onSelectionChange?: (text: string) => void;
};

export type VaultEditorHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  goToLine: (line: number) => void;
};

const MAX_CACHED_DOCUMENTS = 10;
const MAX_CACHED_TEXT_BYTES = 8 * 1024 * 1024;

type CachedEditorState = {
  state: EditorState;
  text: string;
  bytes: number;
  scrollTop: number;
  scrollLeft: number;
};

const externalChange = Annotation.define<boolean>();

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function escapeWikiLinkPath(path: string) {
  return path
    .split("/")
    .map((part) => part.replace(/[\\[\]#|^]/g, (character) => `\\${character}`))
    .join("/");
}

function wikiLinkCompletions(filesRef: {
  current?: VaultEditorFile[];
}): CompletionSource {
  return (context) => {
    const line = context.state.doc.lineAt(context.pos);
    const beforeCursor = line.text.slice(0, context.pos - line.from);
    const match = /\[\[([^\]]*)$/.exec(beforeCursor);
    if (!match || !filesRef.current?.length) return null;

    const options: Completion[] = Array.from(
      new Map(
        filesRef.current
          .filter((file) => file.path.trim())
          .map((file) => [file.path, file]),
      ).values(),
    )
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => {
        const escapedPath = escapeWikiLinkPath(file.path);
        return {
          label: file.path,
          displayLabel: file.path,
          detail: "note",
          apply: `${escapedPath}]]`,
        };
      });

    if (!options.length) return null;
    return {
      from: line.from + match.index + 2,
      options,
      validFor: /^[^\]]*$/,
    };
  };
}

function queryWithSearch(query: SearchQuery, searchText: string) {
  return new SearchQuery({
    search: searchText,
    caseSensitive: query.caseSensitive,
    literal: query.literal,
    regexp: query.regexp,
    replace: query.replace,
    wholeWord: query.wholeWord,
  });
}

function searchPanel(view: EditorView): Panel {
  const form = document.createElement("form");
  form.className = "vault-editor-search";
  form.setAttribute("aria-label", "Find in Markdown note");

  const label = document.createElement("label");
  label.className = "vault-editor-search-label";
  label.textContent = "Find";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "vault-editor-search-input";
  input.setAttribute("main-field", "true");
  input.setAttribute("aria-label", "Find in note");
  label.append(input);

  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "vault-editor-search-button";
  previous.textContent = "Previous";
  previous.setAttribute("aria-label", "Find previous match");

  const next = document.createElement("button");
  next.type = "submit";
  next.className = "vault-editor-search-button vault-editor-search-primary";
  next.textContent = "Next";
  next.setAttribute("aria-label", "Find next match");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "vault-editor-search-button vault-editor-search-close";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close find in note");

  form.append(label, previous, next, close);

  const syncInput = () => {
    const query = getSearchQuery(view.state);
    if (input.value !== query.search) input.value = query.search;
  };
  const setQuery = () => {
    const query = getSearchQuery(view.state);
    view.dispatch({
      effects: setSearchQuery.of(queryWithSearch(query, input.value)),
    });
  };
  const closePanel = () => {
    closeSearchPanel(view);
    view.focus();
  };

  input.addEventListener("input", setQuery);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
    } else if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      findPrevious(view);
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    findNext(view);
  });
  previous.addEventListener("click", () => findPrevious(view));
  close.addEventListener("click", closePanel);
  syncInput();

  return {
    dom: form,
    mount() {
      input.focus();
      input.select();
    },
    update(update) {
      if (
        update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(setSearchQuery)),
        )
      )
        syncInput();
    },
    destroy() {
      input.removeEventListener("input", setQuery);
    },
  };
}

const inkEditorTheme = EditorView.theme({
  "&": {
    color: "var(--ink, #1d1f24)",
    backgroundColor: "transparent",
    fontSize: "15px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
    lineHeight: "1.75",
    overflow: "auto",
  },
  ".cm-content": {
    minHeight: "400px",
    padding: "24px 26px",
    caretColor: "var(--pen, #2346d8)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    border: "0",
    backgroundColor: "transparent",
    color: "var(--muted, #5a5e68)",
    paddingLeft: "12px",
    userSelect: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--pen, #2346d8) 5%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--pen, #2346d8) 22%, transparent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--pen, #2346d8)",
  },
  ".cm-panels": {
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-panels-bottom": {
    borderTop: "1px solid var(--line, #dedfd9)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--paper, #fff)",
    border: "1px solid var(--line, #dedfd9)",
    color: "var(--ink, #1d1f24)",
    boxShadow: "0 8px 24px rgba(29, 31, 36, 0.12)",
  },
});

export const VaultEditor = forwardRef(function VaultEditor(
  {
    documentKey,
    value,
    onChange,
    onSave,
    readOnly = false,
    files,
    autofocus = false,
    onSelectionChange,
  }: VaultEditorProps,
  ref: Ref<VaultEditorHandle>,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const filesRef = useRef(files);
  const editableCompartment = useRef(new Compartment()).current;
  const documentKeyRef = useRef(documentKey);
  const stateCacheRef = useRef(new Map<string, CachedEditorState>());
  const cachedBytesRef = useRef(0);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onSelectionChangeRef.current = onSelectionChange;
  filesRef.current = files;

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      insertText(text) {
        const view = viewRef.current;
        if (!view || view.state.readOnly) return;
        const selection = view.state.selection.main;
        const position = selection.from + text.length;
        view.dispatch({
          changes: {
            from: selection.from,
            to: selection.to,
            insert: text,
          },
          selection: { anchor: position },
          userEvent: "input.complete",
        });
        view.focus();
      },
      goToLine(line) {
        const view = viewRef.current;
        if (!view) return;
        const lineNumber = Math.max(
          1,
          Math.min(Math.floor(line) || 1, view.state.doc.lines),
        );
        const position = view.state.doc.line(lineNumber).from;
        view.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: "center" }),
          userEvent: "select.jump",
        });
        view.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    documentKeyRef.current = documentKey;
    const completionSource = wikiLinkCompletions(filesRef);
    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSaveRef.current();
          return true;
        },
      },
    ]);
    const extensions: Extension[] = [
      editableCompartment.of([
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]),
      history(),
      markdown({ addKeymap: false }),
      syntaxHighlighting(defaultHighlightStyle),
      indentUnit.of("  "),
      lineNumbers(),
      EditorView.lineWrapping,
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      inkEditorTheme,
      search({ top: true, createPanel: searchPanel }),
      autocompletion({ override: [completionSource] }),
      keymap.of([
        ...completionKeymap,
        ...searchKeymap,
        ...markdownKeymap,
        ...historyKeymap,
        ...defaultKeymap,
        indentWithTab,
      ]),
      saveKeymap,
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          const nextValue = update.state.doc.toString();
          const external = update.transactions.some((transaction) =>
            transaction.annotation(externalChange),
          );
          if (!external) onChangeRef.current(nextValue);
        }

        if (update.docChanged || update.selectionSet) {
          const selection = update.state.selection.main;
          onSelectionChangeRef.current?.(
            update.state.sliceDoc(selection.from, selection.to),
          );
        }
      }),
    ];

    let cached = stateCacheRef.current.get(documentKey);
    if (cached && cached.text !== value) {
      stateCacheRef.current.delete(documentKey);
      cachedBytesRef.current -= cached.bytes;
      cached = undefined;
    }
    if (cached) {
      stateCacheRef.current.delete(documentKey);
      cachedBytesRef.current -= cached.bytes;
    }

    const view = new EditorView({
      state: cached?.state || EditorState.create({ doc: value, extensions }),
      parent: host,
    });
    view.dom.classList.add("vault-editor-code");
    view.dom.setAttribute("aria-label", "Markdown note");
    view.dom.setAttribute("aria-multiline", "true");
    view.contentDOM.setAttribute("aria-label", "Markdown note");
    view.contentDOM.setAttribute("aria-multiline", "true");
    viewRef.current = view;

    let frame = 0;
    const restoreGeometry = () => {
      if (viewRef.current !== view) return;
      view.requestMeasure();
      if (cached) {
        view.scrollDOM.scrollTop = cached.scrollTop;
        view.scrollDOM.scrollLeft = cached.scrollLeft;
      }
    };
    const scheduleGeometry = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        restoreGeometry();
      });
    };
    scheduleGeometry();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(scheduleGeometry);
    resizeObserver?.observe(host);
    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting))
              scheduleGeometry();
          });
    intersectionObserver?.observe(host);
    if (autofocus) view.focus();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      const text = view.state.doc.toString();
      const bytes = utf8Bytes(text);
      const previous = stateCacheRef.current.get(documentKey);
      if (previous) cachedBytesRef.current -= previous.bytes;
      stateCacheRef.current.delete(documentKey);
      stateCacheRef.current.set(documentKey, {
        state: view.state,
        text,
        bytes,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
      });
      cachedBytesRef.current += bytes;
      while (
        stateCacheRef.current.size > MAX_CACHED_DOCUMENTS ||
        cachedBytesRef.current > MAX_CACHED_TEXT_BYTES
      ) {
        const oldest = stateCacheRef.current.keys().next().value as
          string | undefined;
        if (oldest === undefined) break;
        const item = stateCacheRef.current.get(oldest);
        stateCacheRef.current.delete(oldest);
        if (item) cachedBytesRef.current -= item.bytes;
      }
      if (viewRef.current === view) viewRef.current = null;
      view.destroy();
    };
  }, [documentKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure([
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]),
    });
  }, [editableCompartment, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || documentKeyRef.current !== documentKey) return;
    if (value === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: [
        externalChange.of(true),
        Transaction.addToHistory.of(false),
      ],
    });
  }, [documentKey, value]);

  useEffect(() => {
    if (autofocus) viewRef.current?.focus();
  }, [autofocus]);

  return (
    <div
      className="ink-writing-surface vault-editor-shell"
      data-read-only={readOnly || undefined}
      aria-label="Markdown note editor"
    >
      <div ref={hostRef} className="vault-editor-host" />
    </div>
  );
});

VaultEditor.displayName = "VaultEditor";
