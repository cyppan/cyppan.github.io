import {
  foldEffect,
  foldedRanges,
  syntaxTree,
  unfoldEffect,
} from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { RangeSet, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { nodeText, unescapeString } from "../../shared/parser/util.js";
import { CodeWidget } from "./widgets/code.js";
import { MediaWidget } from "./widgets/media.js";
import { RefWidget } from "./widgets/ref.js";

/** Extract keyword-value pairs from a Map node as a Record */
function parseMapEntries(
  source: string,
  mapNode: SyntaxNode,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const kw of mapNode.getChildren("Keyword")) {
    const key = nodeText(source, kw);
    const value = kw.nextSibling;
    if (!value) continue;
    result[key] =
      value.name === "String"
        ? unescapeString(nodeText(source, value))
        : nodeText(source, value);
  }
  return result;
}

/** Check if a document position falls inside a folded range.
 *  Uses inclusive comparison: a widget at the fold boundary (e.g.,
 *  media.to === preview.to - 1) is still considered "inside".
 *  This is safe for self-folded forms (code widget at node.to is
 *  always > node.to - 1, so it falls outside its own fold). */
function isInsideFold(state: EditorState, pos: number): boolean {
  let inside = false;
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    if (pos >= from && pos <= to) {
      inside = true;
    }
  });
  return inside;
}

/** Try to build a companion Decoration.widget for a List node.
 *  Returns null if not a recognized/complete DSL form. */
function widgetForList(
  source: string,
  node: SyntaxNode,
  indent: number,
  readonly: boolean,
): { deco: Decoration; pos: number } | null {
  const symbols = node.getChildren("Symbol");
  const formName = symbols[0];
  if (!formName) return null;
  const name = nodeText(source, formName);

  switch (name) {
    case "media": {
      const mapNode = node.getChild("Map");
      if (!mapNode) return null;
      const entries = parseMapEntries(source, mapNode);
      const src = entries[":src"];
      if (!src) return null;
      return {
        deco: Decoration.widget({
          widget: new MediaWidget(src, entries[":alt"] ?? "", indent),
          side: 1,
        }),
        pos: node.to,
      };
    }
    case "ref": {
      if (!readonly) return null;
      const slug = symbols[1];
      if (!slug) return null;
      const strings = node.getChildren("String");
      const labelNode = strings[0];
      const label = labelNode
        ? unescapeString(nodeText(source, labelNode))
        : "";
      return {
        deco: Decoration.widget({
          widget: new RefWidget(nodeText(source, slug), label),
          side: 1,
        }),
        pos: node.to,
      };
    }
    case "code": {
      const strings = node.getChildren("String");
      const codeStringNode = strings[0];
      if (!codeStringNode) return null;
      const kwNode = node.getChild("Keyword");
      const lang = kwNode ? nodeText(source, kwNode).slice(1) : "";
      // Base indent = column of opening " + 1 (structural indent for
      // continuation lines). Strip this many spaces to preserve the
      // code's own relative indentation.
      const quotePos = codeStringNode.from;
      let baseIndent = 0;
      for (let i = quotePos - 1; i >= 0 && source.charCodeAt(i) !== 10; i--) {
        baseIndent++;
      }
      baseIndent += 1; // +1 for the character after the "
      return {
        deco: Decoration.widget({
          widget: new CodeWidget(
            lang,
            unescapeString(nodeText(source, codeStringNode)),
            indent,
            baseIndent,
          ),
          side: 1,
        }),
        pos: node.to,
      };
    }
    default:
      return null;
  }
}

// tree.iterate() does NOT enter overlay-mounted markdown trees,
// so it only finds outer EDN nodes (List, Symbol, etc.) — exactly
// what we need to detect DSL forms.
function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(state);
  const source = state.doc.toString();
  const readonly = !state.facet(EditorView.editable);

  tree.iterate({
    enter(node) {
      if (node.name !== "List") return;
      const line = state.doc.lineAt(node.from);
      const indent = node.from - line.from;
      const result = widgetForList(source, node.node, indent, readonly);
      if (result) {
        // Skip widgets whose position falls inside a folded range
        // (e.g., media/code inside a folded preview)
        if (!isInsideFold(state, result.pos)) {
          decorations.push(result.deco.range(result.pos));
        }
        return false; // don't descend into this List
      }
    },
  });

  return RangeSet.of(decorations, true);
}

// Rebuild on doc changes AND fold/unfold effects (widgets inside folds are suppressed).
const dslWidgetField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    if (
      tr.docChanged ||
      tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
    ) {
      return buildDecorations(tr.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const dslWidgetTheme = EditorView.baseTheme({
  ".cm-media-widget": {
    display: "block",
    padding: "8px 0",
  },
  ".cm-media-widget img": {
    maxWidth: "100%",
    borderRadius: "4px",
    display: "block",
  },
  ".cm-media-error": {
    color: "#b00",
    fontStyle: "italic",
    padding: "8px",
  },
  ".cm-ref-widget": {
    color: "#4078f2",
    textDecoration: "none",
    borderBottom: "1px dashed #4078f2",
    cursor: "pointer",
    marginLeft: "8px",
  },
  ".cm-ref-widget:hover": {
    borderBottom: "1px solid #4078f2",
  },
  ".cm-code-widget": {
    display: "block",
    padding: "4px 0",
  },
  ".cm-code-widget pre": {
    padding: "12px 16px",
    background: "#f6f8fa",
    borderRadius: "6px",
    overflow: "auto",
    fontFamily: mono,
    fontSize: "13px",
    lineHeight: "1.45",
  },
  ".cm-code-widget code": {
    fontFamily: "inherit",
    whiteSpace: "pre",
  },
  ".cm-preview-line": {
    background: "#f0f7ff",
  },
});

// --- Preview background decoration ---

const previewLine = Decoration.line({ class: "cm-preview-line" });

function buildPreviewBgDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  const source = view.state.doc.toString();

  tree.iterate({
    enter(node) {
      if (node.name !== "List") return;
      const syms = node.node.getChildren("Symbol");
      const first = syms[0];
      if (!first || nodeText(source, first) !== "preview") return;

      // Apply line decoration to every line in the preview form range
      const startLine = view.state.doc.lineAt(node.from);
      const endLine = view.state.doc.lineAt(node.to);
      for (let i = startLine.number; i <= endLine.number; i++) {
        const line = view.state.doc.line(i);
        decorations.push(previewLine.range(line.from));
      }
      return false;
    },
  });

  return RangeSet.of(decorations, true);
}

const previewBgPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildPreviewBgDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildPreviewBgDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function dslWidgets(): Extension {
  return [dslWidgetField, previewBgPlugin, dslWidgetTheme];
}
