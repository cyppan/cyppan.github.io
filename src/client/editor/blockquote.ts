import { syntaxTree } from "@codemirror/language";
import type { Extension, Range } from "@codemirror/state";
import { RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const blockquoteLine = Decoration.line({ class: "cm-blockquote" });

// tree.iterate() does NOT enter overlay-mounted trees, so we can't
// find Blockquote nodes that way. Instead, use resolveInner() per line
// (which does enter overlays) and walk up to check for Blockquote.
function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      // Skip leading whitespace so resolveInner lands inside the
      // Blockquote node (after >) rather than in the indent gap which
      // is either before the Blockquote range or outside overlay ranges.
      const nonWS = line.text.search(/\S/);
      const resolveAt =
        nonWS >= 0 ? Math.min(line.from + nonWS + 1, line.to) : line.from;
      let node: { name: string; parent: unknown } | null =
        tree.resolveInner(resolveAt);
      while (node) {
        if (node.name === "Blockquote") {
          decorations.push(blockquoteLine.range(line.from));
          break;
        }
        node = node.parent as typeof node;
      }
      if (line.to >= view.state.doc.length) break;
      pos = line.to + 1;
    }
  }

  return RangeSet.of(decorations, true);
}

const blockquotePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function blockquoteDecoration(): Extension {
  return [
    blockquotePlugin,
    EditorView.baseTheme({
      ".cm-blockquote": {
        borderLeft: "3px solid #d0d7de",
      },
    }),
  ];
}
