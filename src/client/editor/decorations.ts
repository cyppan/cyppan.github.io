import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { RangeSet, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
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

/** Try to build a Decoration.replace for a List node.
 *  Returns null if not a recognized/complete DSL form. */
function decorationForList(
  source: string,
  node: SyntaxNode,
): Decoration | null {
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
      return Decoration.replace({
        widget: new MediaWidget(src, entries[":alt"] ?? ""),
      });
    }
    case "ref": {
      const slug = symbols[1];
      if (!slug) return null;
      const strings = node.getChildren("String");
      const labelNode = strings[0];
      const label = labelNode
        ? unescapeString(nodeText(source, labelNode))
        : "";
      return Decoration.replace({
        widget: new RefWidget(nodeText(source, slug), label),
      });
    }
    case "code": {
      const strings = node.getChildren("String");
      const codeStringNode = strings[0];
      if (!codeStringNode) return null;
      const kwNode = node.getChild("Keyword");
      const lang = kwNode ? nodeText(source, kwNode).slice(1) : "";
      return Decoration.replace({
        widget: new CodeWidget(
          lang,
          unescapeString(nodeText(source, codeStringNode)),
        ),
      });
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

  tree.iterate({
    enter(node) {
      if (node.name !== "List") return;
      const deco = decorationForList(source, node.node);
      if (deco) {
        decorations.push(deco.range(node.from, node.to));
        return false; // don't descend into this List
      }
    },
  });

  return RangeSet.of(decorations, true);
}

// Multi-line Decoration.replace cannot be provided via ViewPlugin
// (CM6 forbids plugin-sourced decorations that cross line breaks).
// Use a StateField + EditorView.decorations.from() instead.
const dslWidgetField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildDecorations(tr.state);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const dslWidgetTheme = EditorView.baseTheme({
  ".cm-media-widget": {
    padding: "8px 0",
  },
  ".cm-media-widget img": {
    maxWidth: "100%",
    borderRadius: "4px",
  },
  ".cm-media-error": {
    color: "#b00",
    fontStyle: "italic",
    padding: "8px",
    background: "#fff0f0",
    borderRadius: "4px",
  },
  ".cm-ref-widget": {
    color: "#4078f2",
    textDecoration: "none",
    borderBottom: "1px dashed #4078f2",
    cursor: "pointer",
  },
  ".cm-ref-widget:hover": {
    borderBottom: "1px solid #4078f2",
  },
  ".cm-code-widget": {
    position: "relative",
    margin: "4px 0",
    background: "#f6f8fa",
    borderRadius: "6px",
    border: "1px solid #d0d7de",
    overflow: "hidden",
  },
  ".cm-code-widget pre": {
    margin: "0",
    padding: "12px 16px",
    overflow: "auto",
    fontFamily: mono,
    fontSize: "13px",
    lineHeight: "1.45",
  },
  ".cm-code-widget code": {
    fontFamily: "inherit",
    whiteSpace: "pre",
  },
  ".cm-code-lang": {
    position: "absolute",
    top: "4px",
    right: "8px",
    fontSize: "11px",
    color: "#6a737d",
    fontFamily: mono,
  },
});

export function dslWidgets(): Extension {
  return [dslWidgetField, dslWidgetTheme];
}
