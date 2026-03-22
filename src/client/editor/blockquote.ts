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
      // resolveInner enters overlay trees, so it finds markdown nodes
      let node: { name: string; parent: unknown } | null = tree.resolveInner(
        Math.min(line.from + 1, line.to),
      );
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
        paddingLeft: "12px",
      },
    }),
  ];
}
