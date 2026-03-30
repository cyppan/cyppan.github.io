import {
  codeFolding,
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { RangeSet } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";

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

/** Auto-fold (preview ...) forms on editor init */
export function autoFoldPreview(): Extension {
  return EditorView.updateListener.of((update) => {
    // Only run once, on the first update where the tree is ready
    if (!update.view.dom.dataset.previewFolded) {
      const tree = syntaxTree(update.state);
      if (tree.length < update.state.doc.length) return;

      const source = update.state.doc.toString();
      const defnote = tree.topNode.getChild("List");
      if (!defnote) return;

      update.view.dom.dataset.previewFolded = "1";

      for (const list of defnote.getChildren("List")) {
        const syms = list.getChildren("Symbol");
        const first = syms[0];
        if (first && source.slice(first.from, first.to) === "preview") {
          const foldFrom = list.from + 1;
          const foldTo = list.to - 1;
          if (foldFrom < foldTo) {
            requestAnimationFrame(() => {
              update.view.dispatch({
                effects: foldEffect.of({ from: foldFrom, to: foldTo }),
              });
            });
          }
          return;
        }
      }
    }
  });
}

/** Auto-fold (code ...) forms on editor init (for readonly mode).
 *  Hides the string content; the CodeWidget block after node.to
 *  (outside the fold range) still renders the highlighted code. */
export function autoFoldCode(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.view.dom.dataset.codeFolded) {
      const tree = syntaxTree(update.state);
      if (tree.length < update.state.doc.length) return;

      const source = update.state.doc.toString();
      update.view.dom.dataset.codeFolded = "1";

      const effects: Array<ReturnType<typeof foldEffect.of>> = [];
      tree.iterate({
        enter(node) {
          if (node.name !== "List") return;
          const syms = node.node.getChildren("Symbol");
          const first = syms[0];
          if (first && source.slice(first.from, first.to) === "code") {
            const foldFrom = node.from + 1;
            const foldTo = node.to - 1;
            // Only fold multi-line code forms
            if (
              foldFrom < foldTo &&
              update.state.doc.lineAt(foldFrom).number <
                update.state.doc.lineAt(foldTo).number
            ) {
              effects.push(foldEffect.of({ from: foldFrom, to: foldTo }));
            }
            return false;
          }
        },
      });

      if (effects.length > 0) {
        requestAnimationFrame(() => {
          update.view.dispatch({ effects });
        });
      }
    }
  });
}

export function ednFoldGutter(): Extension {
  return [
    codeFolding({
      preparePlaceholder(state, range) {
        // Text from fold start to end of that line = first line of folded content
        const line = state.doc.lineAt(range.from);
        return state.doc.sliceString(range.from, line.to).trimEnd();
      },
      placeholderDOM(_view, onclick, prepared) {
        const span = document.createElement("span");
        span.className = "cm-foldPlaceholder";
        span.textContent = prepared ? `${prepared} \u2026` : "\u2026";
        span.title = "Unfold";
        span.setAttribute("aria-label", "Unfold");
        span.addEventListener("click", onclick);
        return span;
      },
    }),
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
