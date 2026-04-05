import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { RangeSet, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { Tree } from "@lezer/common";
import { parseMarkdownTable, TableWidget } from "./widgets/table.js";

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;
  const seen = new Set<number>();
  const readonly = !state.facet(EditorView.editable);

  // Scan the entire document (StateField has no visibleRanges)
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
      if (node.name === "Table" && !seen.has(node.from)) {
        seen.add(node.from);

        // Expand to full line boundaries (required for block replace decorations)
        const lineFrom = doc.lineAt(node.from).from;
        const lineTo = doc.lineAt(node.to).to;
        const rawText = doc.sliceString(lineFrom, lineTo);
        const indent = doc.lineAt(node.from).text.match(/^(\s*)/)?.[1] ?? "";
        const { headers, rows } = parseMarkdownTable(rawText, indent);

        decorations.push(
          Decoration.replace({
            widget: new TableWidget(
              headers,
              rows,
              lineFrom,
              lineTo,
              indent,
              readonly,
            ),
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

// StateField is required for block replace decorations (ViewPlugin is not allowed).
// We store the tree reference alongside decorations so we can detect parser
// progress (new tree object = parser made progress = need to rebuild).
const tableField = StateField.define<{
  decorations: DecorationSet;
  tree: Tree;
}>({
  create(state) {
    const tree = syntaxTree(state);
    return { decorations: buildDecorations(state), tree };
  },
  update(value, tr) {
    const tree = syntaxTree(tr.state);
    // Rebuild when: document changed, or parser made progress (tree reference changed)
    if (tr.docChanged || tree !== value.tree) {
      return { decorations: buildDecorations(tr.state), tree };
    }
    return value;
  },
  provide: (f) => [
    EditorView.decorations.from(f, (v) => v.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(f).decorations),
  ],
});

const serif = "Junicode, serif";
const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

export function tableDecoration(): Extension {
  return [
    tableField,
    EditorView.baseTheme({
      ".cm-table-widget": {
        display: "block",
        padding: "4px 0",
        userSelect: "none",
        overflow: "hidden",
      },
      ".cm-table-widget table": {
        borderCollapse: "collapse",
        fontFamily: serif,
        fontSize: "15px",
        lineHeight: "1.4",
        display: "block",
        overflowX: "auto",
      },
      ".cm-table-widget th, .cm-table-widget td": {
        border: "1px solid #d0d7de",
        padding: "0",
        position: "relative",
        wordBreak: "normal",
        overflowWrap: "normal",
      },
      ".cm-table-widget th": {
        background: "#f6f8fa",
        fontWeight: "600",
      },
      ".cm-table-widget textarea": {
        border: "none",
        background: "transparent",
        font: "inherit",
        width: "100%",
        padding: "4px 8px",
        outline: "none",
        boxSizing: "border-box",
        userSelect: "text",
        resize: "none",
        overflow: "hidden",
        display: "block",
        lineHeight: "inherit",
      },
      ".cm-table-widget textarea:focus": {
        background: "#f0f7ff",
      },
      ".cm-table-del-col": {
        position: "absolute",
        top: "2px",
        right: "2px",
        border: "none",
        background: "none",
        cursor: "pointer",
        color: "#aaa",
        fontSize: "11px",
        lineHeight: "1",
        padding: "0 2px",
        display: "none",
      },
      ".cm-table-widget th:hover .cm-table-del-col": {
        display: "block",
      },
      ".cm-table-row-actions": {
        border: "none !important",
        background: "transparent",
        padding: "0 2px",
        width: "20px",
      },
      ".cm-table-del-row": {
        border: "none",
        background: "none",
        cursor: "pointer",
        color: "#aaa",
        fontSize: "13px",
        padding: "0",
        display: "none",
      },
      ".cm-table-widget tr:hover .cm-table-del-row": {
        display: "block",
      },
      ".cm-table-controls": {
        display: "flex",
        gap: "4px",
        marginTop: "4px",
        fontFamily: mono,
        fontSize: "11px",
      },
      ".cm-table-controls button": {
        border: "1px solid #d0d7de",
        background: "#f6f8fa",
        borderRadius: "3px",
        cursor: "pointer",
        padding: "1px 6px",
        color: "#555",
        fontSize: "11px",
      },
      ".cm-table-controls button:hover": {
        background: "#e8eef4",
      },
    }),
  ];
}
