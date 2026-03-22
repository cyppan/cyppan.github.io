import type { Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

const spaceMark = Decoration.mark({ class: "cm-ws-dot" });

const decorator = new MatchDecorator({
  regexp: / /g,
  decoration: () => spaceMark,
  boundary: /\S/,
});

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorator.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = decorator.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  ".cm-ws-dot": {
    backgroundImage:
      "radial-gradient(circle at 50% 55%, #ccc 7%, transparent 12%)",
    backgroundPosition: "center",
  },
});

export function whitespaceMarks(): Extension {
  return [plugin, theme];
}
