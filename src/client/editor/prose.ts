import { syntaxTree } from "@codemirror/language";
import type { Extension, Range, Text } from "@codemirror/state";
import { RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const proseMark = Decoration.mark({ class: "cm-prose" });

// Compute prose ranges for a StringContent node, excluding the structural
// indent spaces on continuation lines. The indent aligns with column of
// opening " + 1 and is part of the DSL layout, not the prose content.
function addProseRanges(
  doc: Text,
  contentFrom: number,
  contentTo: number,
  decorations: Range<Decoration>[],
) {
  if (contentFrom >= contentTo) return;

  const firstLine = doc.lineAt(contentFrom);
  // Base indent = column of StringContent start = column right after "
  const baseIndent = contentFrom - firstLine.from;

  // First line: mark entirely (starts right after ", no indent to skip)
  decorations.push(
    proseMark.range(contentFrom, Math.min(firstLine.to, contentTo)),
  );

  // Continuation lines: skip up to baseIndent space characters
  let pos = firstLine.to + 1;
  while (pos < contentTo) {
    const line = doc.lineAt(pos);
    const lineEnd = Math.min(line.to, contentTo);
    const text = line.text;

    let skipped = 0;
    while (
      skipped < baseIndent &&
      skipped < text.length &&
      text[skipped] === " "
    ) {
      skipped++;
    }

    const proseStart = pos + skipped;
    if (proseStart < lineEnd) {
      decorations.push(proseMark.range(proseStart, lineEnd));
    }

    pos = line.to + 1;
  }
}

// StringContent is an outer-tree (EDN) node, so tree.iterate() finds it
// (it doesn't enter the overlay-mounted markdown tree, but StringContent
// itself is in the EDN tree).
function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === "StringContent") {
          addProseRanges(view.state.doc, node.from, node.to, decorations);
        }
      },
    });
  }

  return RangeSet.of(decorations, true);
}

const prosePlugin = ViewPlugin.fromClass(
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

export function proseDecoration(): Extension {
  return [
    prosePlugin,
    EditorView.baseTheme({
      ".cm-prose": {
        fontFamily: "'New York', 'Iowan Old Style', Georgia, serif",
      },
    }),
  ];
}
