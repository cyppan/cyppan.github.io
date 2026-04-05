import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const serif = "Junicode, serif";

const highlightStyle = HighlightStyle.define([
  // EDN DSL tokens — inherit monospace from base, only need color/style
  { tag: t.variableName, color: "#5f9e94" },
  { tag: t.labelName, color: "#399ee6" },
  { tag: t.atom, color: "#a37acc" },
  { tag: t.string, color: "#86b300" },
  { tag: t.number, color: "#ff9940" },
  { tag: t.bool, color: "#fa8d3e" },
  { tag: t.null, color: "#fa8d3e" },
  { tag: t.lineComment, color: "#abb0b6", fontStyle: "italic" },
  { tag: t.paren, color: "#8a9199" },
  { tag: t.squareBracket, color: "#8a9199" },
  { tag: t.brace, color: "#8a9199" },

  // Markdown tokens (from nested eparser) — explicit serif to override
  // monospace base. Plain paragraph text gets serif from the .cm-prose
  // mark decoration (see prose.ts). Tokens need explicit fontFamily
  // because CM6 flattens mark decorations with highlight spans into a
  // single element, so CSS inheritance doesn't apply.
  { tag: t.heading1, fontSize: "1.5em", fontWeight: "bold", fontFamily: serif },
  { tag: t.heading2, fontSize: "1.4em", fontWeight: "bold", fontFamily: serif },
  { tag: t.heading3, fontSize: "1.3em", fontWeight: "bold", fontFamily: serif },
  { tag: t.emphasis, fontStyle: "italic", fontFamily: serif },
  { tag: t.strong, fontWeight: "bold", fontFamily: serif },
  { tag: t.strikethrough, textDecoration: "line-through", fontFamily: serif },
  {
    tag: t.link,
    color: "#4078f2",
    textDecoration: "underline",
    fontFamily: serif,
  },
  { tag: t.monospace, color: "#e45649", fontFamily: mono, fontSize: "14px" },
  { tag: t.list, color: "#3a2f4a", fontFamily: serif },
  { tag: t.quote, color: "#6a737d", fontStyle: "italic" },
]);

export const notesHighlightExt = syntaxHighlighting(highlightStyle);

// Exported for testing highlight tag resolution
export { highlightStyle as testHighlightStyle };

// Base font is monospace — DSL-first. String content overrides to serif
// via the prose mark decoration (see prose.ts).
export const notesTheme = EditorView.theme({
  "&": {
    fontSize: "14px",
    fontFamily: mono,
  },
  ".cm-content": {
    fontFamily: mono,
    padding: "12px 0",
  },
  ".cm-gutters": {
    background: "transparent",
    border: "none",
    color: "#c0c0c0",
    fontFamily: mono,
  },
  ".cm-line": {
    padding: "0 8px",
  },
  ".cm-prose": {
    fontFamily: "Junicode, serif",
    fontSize: "17px",
  },
  ".cm-table-widget textarea": {
    fontFamily: "Junicode, serif",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground": {
    background: "#d7e4f2 !important",
  },
  ".cm-foldGutter .cm-gutterElement": {
    cursor: "pointer",
  },
  "&.cm-editor .cm-highlightSpace": {
    backgroundImage:
      "radial-gradient(circle at 50% 55%, #ccc 7%, transparent 12%)",
  },
});

export const readTheme = EditorView.theme({
  ".cm-cursor": { display: "none !important" },
  ".cm-activeLine": { background: "transparent" },
  ".cm-activeLineGutter": { background: "transparent" },
});
