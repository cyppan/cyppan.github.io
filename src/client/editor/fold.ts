import {
  codeFolding,
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { RangeSet } from "@codemirror/state";
import { GutterMarker, gutter } from "@codemirror/view";

const EDN_FOLDABLE = new Set(["List", "Vector", "Map", "String"]);

export { foldKeymap } from "@codemirror/language";

/** Compute the fold range for an EDN node starting on this line */
function ednFoldRange(
  state: EditorState,
  lineStart: number,
  lineEnd: number,
): { from: number; to: number } | null {
  const tree = syntaxTree(state);
  let result: { from: number; to: number } | null = null;

  tree.iterate({
    from: lineStart,
    to: lineEnd,
    enter(node) {
      if (result) return false;
      if (!EDN_FOLDABLE.has(node.name)) return undefined;

      // Node doesn't start on this line — descend to find inner nodes that do
      if (node.from < lineStart || node.from > lineEnd) return undefined;

      // Node starts on this line — check if it's multi-line and foldable
      // All EDN foldable types have single-char delimiters: ( ) [ ] { } " "
      const foldFrom = node.from + 1;
      const foldTo = node.to - 1;
      if (foldFrom < foldTo) {
        const startLine = state.doc.lineAt(foldFrom).number;
        const endLine = state.doc.lineAt(foldTo).number;
        if (startLine < endLine) {
          result = { from: foldFrom, to: foldTo };
        }
      }
      // Don't descend — take the outermost foldable on this line
      return false;
    },
  });

  return result;
}

const foldMarker = new (class extends GutterMarker {
  override toDOM() {
    const span = document.createElement("span");
    span.textContent = "\u25BE";
    span.title = "Fold";
    return span;
  }
})();

const unfoldMarker = new (class extends GutterMarker {
  override toDOM() {
    const span = document.createElement("span");
    span.textContent = "\u25B8";
    span.title = "Unfold";
    return span;
  }
})();

export function ednFoldGutter(): Extension {
  return [
    codeFolding(),
    gutter({
      class: "cm-foldGutter",
      markers(view) {
        const markers: Range<GutterMarker>[] = [];
        const folded = foldedRanges(view.state);

        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = view.state.doc.lineAt(pos);

            let isFolded = false;
            folded.between(line.from, line.to, () => {
              isFolded = true;
            });

            if (isFolded) {
              markers.push(unfoldMarker.range(line.from));
            } else {
              const range = ednFoldRange(view.state, line.from, line.to);
              if (range) {
                markers.push(foldMarker.range(line.from));
              }
            }

            if (line.to >= view.state.doc.length) break;
            pos = line.to + 1;
          }
        }

        return RangeSet.of(markers, true);
      },
      initialSpacer: () => foldMarker,
      domEventHandlers: {
        click(view, line) {
          const folded = foldedRanges(view.state);
          let handled = false;
          folded.between(line.from, line.to, (from, to) => {
            if (!handled) {
              view.dispatch({ effects: unfoldEffect.of({ from, to }) });
              handled = true;
            }
          });
          if (handled) return true;

          const range = ednFoldRange(view.state, line.from, line.to);
          if (range) {
            view.dispatch({ effects: foldEffect.of(range) });
            return true;
          }
          return false;
        },
      },
    }),
  ];
}
