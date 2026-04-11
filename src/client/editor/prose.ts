import { syntaxTree } from "@codemirror/language";
import type { Extension, Range, Text } from "@codemirror/state";
import { RangeSet } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
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
          // Skip prose marks for code form strings (keep monospace)
          const strNode = node.node.parent;
          const listNode = strNode?.parent;
          if (listNode?.name === "List") {
            const sym = listNode.getChild("Symbol");
            if (
              sym &&
              view.state.doc.sliceString(sym.from, sym.to) === "code"
            ) {
              return;
            }
          }
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

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.textContent = "➜";
    return span;
  }
  override eq() {
    return true;
  }
}

const bulletReplace = Decoration.replace({ widget: new BulletWidget() });

function buildBulletDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "StringContent") return;
        // Skip code form strings
        const strNode = node.node.parent;
        const listNode = strNode?.parent;
        if (listNode?.name === "List") {
          const sym = listNode.getChild("Symbol");
          if (sym && view.state.doc.sliceString(sym.from, sym.to) === "code") {
            return;
          }
        }

        const doc = view.state.doc;
        const contentFrom = node.from;
        const contentTo = node.to;
        if (contentFrom >= contentTo) return;

        const firstLine = doc.lineAt(contentFrom);
        const baseIndent = contentFrom - firstLine.from;

        let pos = contentFrom;
        while (pos < contentTo) {
          const line = doc.lineAt(pos);
          const text = line.text;

          // Skip structural indent (up to baseIndent spaces)
          let skipped = 0;
          if (pos !== contentFrom) {
            while (
              skipped < baseIndent &&
              skipped < text.length &&
              text[skipped] === " "
            ) {
              skipped++;
            }
          } else {
            skipped = contentFrom - line.from;
          }

          if (
            skipped < text.length &&
            text[skipped] === "-" &&
            skipped + 1 < text.length &&
            text[skipped + 1] === " "
          ) {
            const dashPos = line.from + skipped;
            decorations.push(bulletReplace.range(dashPos, dashPos + 1));
          }

          if (line.to >= contentTo) break;
          pos = line.to + 1;
        }
      },
    });
  }

  return RangeSet.of(decorations, true);
}

const bulletPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildBulletDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildBulletDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function proseDecoration(): Extension {
  return [prosePlugin, bulletPlugin];
}
