import {
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { RangeSet, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type { Tree } from "@lezer/common";

const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

class FencedCodeWidget extends WidgetType {
  constructor(
    readonly content: string,
    readonly indent: string,
  ) {
    super();
  }

  override eq(other: FencedCodeWidget): boolean {
    return this.content === other.content;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-fenced-code-widget";
    wrapper.style.paddingLeft = `${8 + this.indent.length * view.defaultCharacterWidth}px`;

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = this.content;

    pre.appendChild(code);
    wrapper.appendChild(pre);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function isInsideFold(state: EditorState, pos: number): boolean {
  let inside = false;
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    if (pos >= from && pos <= to) {
      inside = true;
    }
  });
  return inside;
}

function extractCodeContent(rawText: string, indent: string): string {
  const lines = rawText
    .split("\n")
    .map((l) =>
      l.startsWith(indent) ? l.slice(indent.length) : l.trimStart(),
    );
  // First line is ```[lang], last line is ```
  // Content is everything in between
  return lines.slice(1, -1).join("\n");
}

function buildDecorations(state: EditorState): DecorationSet {
  const readonly = !state.facet(EditorView.editable);
  if (!readonly) return RangeSet.empty;

  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;
  const seen = new Set<number>();

  // resolveInner enters overlay-mounted markdown trees (tree.iterate does not).
  // Walk lines and look for FencedCode ancestors.
  let pos = 0;
  while (pos < doc.length) {
    const line = doc.lineAt(pos);
    const nonWS = line.text.search(/\S/);
    const resolveAt =
      nonWS >= 0 ? Math.min(line.from + nonWS + 1, line.to) : line.from;

    let node: {
      name: string;
      from: number;
      to: number;
      parent: unknown;
    } | null = tree.resolveInner(resolveAt);

    while (node) {
      if (node.name === "FencedCode" && !seen.has(node.from)) {
        seen.add(node.from);

        const lineFrom = doc.lineAt(node.from).from;
        const lineTo = doc.lineAt(node.to).to;

        // Skip if inside a folded range (same check as dslWidgetField)
        if (isInsideFold(state, lineFrom)) break;

        const rawText = doc.sliceString(lineFrom, lineTo);
        const indent = doc.lineAt(node.from).text.match(/^(\s*)/)?.[1] ?? "";
        const content = extractCodeContent(rawText, indent);

        decorations.push(
          Decoration.replace({
            widget: new FencedCodeWidget(content, indent),
            block: true,
          }).range(lineFrom, lineTo),
        );
        break;
      }
      node = node.parent as typeof node;
    }

    if (line.to >= doc.length) break;
    pos = line.to + 1;
  }

  return RangeSet.of(decorations, true);
}

const fencedCodeField = StateField.define<{
  decorations: DecorationSet;
  tree: Tree;
}>({
  create(state) {
    const tree = syntaxTree(state);
    return { decorations: buildDecorations(state), tree };
  },
  update(value, tr) {
    const tree = syntaxTree(tr.state);
    if (
      tr.docChanged ||
      tree !== value.tree ||
      tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
    ) {
      return { decorations: buildDecorations(tr.state), tree };
    }
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(f).decorations),
  ],
});

export function fencedCodeDecoration(): Extension {
  return [
    fencedCodeField,
    EditorView.baseTheme({
      ".cm-fenced-code-widget": {
        display: "block",
        padding: "4px 0",
        overflow: "hidden",
      },
      ".cm-fenced-code-widget pre": {
        padding: "12px 16px",
        background: "#f6f8fa",
        borderRadius: "6px",
        overflowX: "auto",
        overflowY: "hidden",
        fontFamily: mono,
        fontSize: "13px",
        lineHeight: "1.45",
        WebkitOverflowScrolling: "touch",
        scrollbarWidth: "thin",
        scrollbarColor: "#c0c0c0 transparent",
      },
      ".cm-fenced-code-widget pre::-webkit-scrollbar": {
        WebkitAppearance: "none",
        height: "6px",
      },
      ".cm-fenced-code-widget pre::-webkit-scrollbar-thumb": {
        background: "#c0c0c0",
        borderRadius: "3px",
      },
      ".cm-fenced-code-widget pre::-webkit-scrollbar-track": {
        background: "transparent",
      },
      ".cm-fenced-code-widget code": {
        fontFamily: "inherit",
        whiteSpace: "pre",
      },
    }),
  ];
}
