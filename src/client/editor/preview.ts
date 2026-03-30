import { syntaxTree } from "@codemirror/language";
import type { Extension, Range } from "@codemirror/state";
import { RangeSet, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { nodeText } from "../../shared/parser/util.js";
import { createEditor } from "./setup.js";

/** Zero-size widget used to replace hidden ranges */
class HiddenWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "none";
    return span;
  }
}

const hiddenWidget = new HiddenWidget();

/** Find the (preview ...) form's inner content range in the parse tree.
 *  Returns { from, to } of the content between "preview" symbol and closing paren,
 *  or null if no preview form found. */
function findPreviewRange(
  state: import("@codemirror/state").EditorState,
): { from: number; to: number } | null {
  const tree = syntaxTree(state);
  const source = state.doc.toString();
  const defnote = tree.topNode.getChild("List");
  if (!defnote) return null;

  for (const list of defnote.getChildren("List")) {
    const syms = list.getChildren("Symbol");
    const first = syms[0];
    if (first && nodeText(source, first) === "preview") {
      // Inner content: from after "preview" symbol to before closing ")"
      return { from: first.to, to: list.to - 1 };
    }
  }
  return null;
}

/** StateField that hides everything outside the preview content range */
function previewClipField(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildClipDecorations(state);
    },
    update(deco, tr) {
      if (tr.docChanged) return buildClipDecorations(tr.state);
      return deco;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function buildClipDecorations(
  state: import("@codemirror/state").EditorState,
): DecorationSet {
  const range = findPreviewRange(state);
  if (!range) return RangeSet.empty;

  const decorations: Range<Decoration>[] = [];
  const docLen = state.doc.length;

  // Hide everything before the preview content
  if (range.from > 0) {
    decorations.push(
      Decoration.replace({ widget: hiddenWidget }).range(0, range.from),
    );
  }

  // Hide everything after the preview content
  if (range.to < docLen) {
    decorations.push(
      Decoration.replace({ widget: hiddenWidget }).range(range.to, docLen),
    );
  }

  return RangeSet.of(decorations, true);
}

const previewTheme = EditorView.theme({
  "&": {
    background: "#f0f7ff",
    borderRadius: "6px",
    padding: "4px 8px",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLineGutter": {
    display: "none",
  },
  ".cm-content": {
    padding: "0",
  },
});

/** Create a readonly CM6 editor that only shows the preview content of a note */
export function createPreviewEditor(
  target: HTMLElement,
  noteSource: string,
): void {
  createEditor({
    target,
    source: noteSource,
    readonly: true,
    extraExtensions: [previewClipField(), previewTheme],
  });
}
