import type { Extension, Range } from "@codemirror/state";
import { RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      let n = 0;
      while (n < text.length && text.charCodeAt(n) === 32) {
        n++;
      }

      if (n > 0) {
        decorations.push(
          Decoration.line({
            attributes: {
              style: `text-indent: -${n}ch; padding-left: calc(${n}ch + 8px);`,
            },
          }).range(line.from),
        );
      }

      if (line.to >= view.state.doc.length) break;
      pos = line.to + 1;
    }
  }

  return RangeSet.of(decorations, true);
}

const wrapIndentPlugin = ViewPlugin.fromClass(
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

export function wrapIndent(): Extension {
  return wrapIndentPlugin;
}
