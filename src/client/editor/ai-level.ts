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

const AI_BLOG_URL =
  "https://www.visidata.org/blog/2026/ai/#self-assessed-ai-level-for-contributions";

const aiLevelMark = Decoration.mark({ class: "cm-ai-level-link" });

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  const source = view.state.doc.toString();

  tree.iterate({
    enter(node) {
      if (node.name !== "Keyword") return;
      const text = source.slice(node.from, node.to);
      if (text !== ":ai-contribution") return;

      const sibling = node.node.nextSibling;
      if (sibling?.name === "Keyword") {
        const val = source.slice(sibling.from, sibling.to);
        if (/^:level-\d+$/.test(val)) {
          decorations.push(aiLevelMark.range(sibling.from, sibling.to));
        }
      }
    },
  });

  return RangeSet.of(decorations, true);
}

const aiLevelPlugin = ViewPlugin.fromClass(
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
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      click(event, _view) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest(".cm-ai-level-link")
        ) {
          event.preventDefault();
          window.open(AI_BLOG_URL, "_blank", "noopener");
          return true;
        }
        return false;
      },
    },
  },
);

export function aiLevelDecoration(): Extension {
  return [
    aiLevelPlugin,
    EditorView.baseTheme({
      ".cm-ai-level-link": {
        color: "#4078f2",
        cursor: "pointer",
        textDecoration: "underline dashed",
      },
    }),
  ];
}
