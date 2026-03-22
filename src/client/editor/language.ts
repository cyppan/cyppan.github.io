import {
  insertNewlineContinueMarkup,
  markdown,
} from "@codemirror/lang-markdown";
import {
  delimitedIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
  indentService,
  LanguageSupport,
  LRLanguage,
  syntaxTree,
} from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";
import type { Input } from "@lezer/common";
import { parseMixed } from "@lezer/common";
import { parser as ednParser } from "../../shared/parser/parser.js";

const mdSupport = markdown();
const mdParser = mdSupport.language.parser;

// Compute overlay ranges that strip the common leading indentation from
// continuation lines in a StringContent node. This prevents the nested
// markdown parser from misinterpreting indented prose as code blocks.
//
// For a string like:
//   "## Heading
//    paragraph
//    more text"
//
// The base indent is 3 (min indent of non-empty continuation lines).
// The overlays cover the first line fully, then skip 3 leading spaces
// on each continuation line — so the markdown parser sees:
//   ## Heading\nparagraph\nmore text
export function computeDedentOverlays(
  input: Input,
  from: number,
  to: number,
): { from: number; to: number }[] | undefined {
  // Single-line or empty content: no overlays needed
  if (from >= to) return undefined;

  // Scan for newline positions and measure continuation line indents
  const lineStarts: number[] = []; // absolute positions of chars after each \n
  for (let pos = from; pos < to; pos++) {
    if (input.read(pos, pos + 1) === "\n") {
      lineStarts.push(pos + 1);
    }
  }
  // No continuation lines — single-line string
  if (lineStarts.length === 0) return undefined;

  // Measure leading spaces on each continuation line, track minimum
  let baseIndent = Infinity;
  for (const start of lineStarts) {
    // Skip empty lines (only whitespace before next \n or end)
    let spaces = 0;
    let pos = start;
    while (pos < to && input.read(pos, pos + 1) === " ") {
      spaces++;
      pos++;
    }
    // Empty line or whitespace-only line — don't count
    if (pos >= to || input.read(pos, pos + 1) === "\n") continue;
    baseIndent = Math.min(baseIndent, spaces);
  }

  // No non-empty continuation lines, or no indent to strip
  if (baseIndent === 0 || baseIndent === Infinity) return undefined;

  // Build overlay ranges: first line fully, then skip baseIndent on each continuation line
  const overlays: { from: number; to: number }[] = [];

  // First line: from start up to and including first \n
  overlays.push({ from, to: lineStarts[0] as number });

  for (let i = 0; i < lineStarts.length; i++) {
    const lineStart = lineStarts[i] as number;
    const nextStart = lineStarts[i + 1];
    const lineEnd = nextStart !== undefined ? nextStart : to;

    // Measure actual spaces on this line (may be less than baseIndent for empty lines)
    let spaces = 0;
    let stripped = lineStart;
    while (
      stripped < lineEnd &&
      spaces < baseIndent &&
      input.read(stripped, stripped + 1) === " "
    ) {
      spaces++;
      stripped++;
    }

    // Include from after stripped spaces to end of line (including \n)
    if (stripped < lineEnd) {
      overlays.push({ from: stripped, to: lineEnd });
    }
  }

  return overlays;
}

// Wrap the EDN parser with nested markdown parsing inside StringContent nodes.
// The grammar defines String[isolate] { '"' StringContent? '"' } —
// StringContent excludes the quote characters, so the markdown parser
// only sees the inner text.
const mixedParser = ednParser.configure({
  props: [
    indentNodeProp.add({
      // Lisp body indent: 2 spaces from ( regardless of content after it
      List: delimitedIndent({ closing: ")", align: false }),
      // Align content with column after [ or {
      Vector: delimitedIndent({ closing: "]" }),
      Map: delimitedIndent({ closing: "}" }),
      // Custom: indent to column of opening " + 1
      String(context) {
        const quoteCol = context.column(context.node.from);
        const closing = context.textAfter.trimStart().startsWith('"');
        return closing ? quoteCol : quoteCol + 1;
      },
    }),
    // Folding: collapse content between delimiters
    foldNodeProp.add({
      List: foldInside,
      Vector: foldInside,
      Map: foldInside,
      String: foldInside,
    }),
  ],
  wrap: parseMixed((node, input) => {
    if (node.name === "StringContent") {
      const overlays = computeDedentOverlays(input, node.from, node.to);
      // Always use overlay mounting so StringContent stays in the outer tree.
      // Full mounts (no overlay) replace the node in tree.iterate(), hiding
      // StringContent from ViewPlugins like proseDecoration that walk the
      // EDN tree looking for it.
      return {
        parser: mdParser,
        overlay: overlays ?? [{ from: node.from, to: node.to }],
      };
    }
    return null;
  }),
});

export const notesLanguage = LRLanguage.define({
  name: "notes-edn",
  parser: mixedParser,
  languageData: {
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    commentTokens: { line: ";" },
  },
});

// Walk up the tree from a resolved node to find an enclosing String node.
// Returns { from, to } of the String, or null if not inside one.
// Uses resolveInner which enters overlay-mounted trees.
function findEnclosingString(
  tree: ReturnType<typeof syntaxTree>,
  pos: number,
): { from: number; to: number } | null {
  for (
    let node: {
      name: string;
      from: number;
      to: number;
      parent: unknown;
    } | null = tree.resolveInner(pos, -1);
    node;
    node = node.parent as typeof node
  ) {
    if (node.name === "String") {
      return { from: node.from, to: node.to };
    }
  }
  return null;
}

// indentService runs before language-specific indentation.
// Inside StringContent, the markdown language takes over and our
// indentNodeProp on String is never reached. This service intercepts
// indentation requests inside strings and computes quote column + 1.
const stringIndent = indentService.of((context, pos) => {
  const str = findEnclosingString(syntaxTree(context.state), pos);
  if (!str) return undefined;
  // Exclude positions at or outside quotes: opening " is at str.from,
  // closing " is at str.to - 1. Let the normal indent chain handle these.
  if (pos <= str.from || pos >= str.to - 1) return undefined;

  const openingLine = context.state.doc.lineAt(str.from);
  const col = str.from - openingLine.from;
  const posLine = context.state.doc.lineAt(pos);
  // Only apply closing-quote alignment when re-indenting an existing line,
  // not when computing indent for a new line after Enter (simulatedBreak set).
  const closing =
    context.simulatedBreak == null &&
    posLine.number !== openingLine.number &&
    posLine.text.trimStart().startsWith('"');
  return closing ? col : col + 1;
});

// Wrap the markdown insertNewlineContinueMarkup command so that when it
// fires inside a String, the new line gets the string's base indent
// prepended. Without this, the markdown command inserts `\n> ` at column 0.
const wrappedMarkdownEnter: Command = (view) => {
  const pos = view.state.selection.main.head;
  const str = findEnclosingString(syntaxTree(view.state), pos);
  if (!str || pos <= str.from || pos >= str.to) return false;

  const openingLine = view.state.doc.lineAt(str.from);
  const col = str.from - openingLine.from;
  const baseIndent = " ".repeat(col + 1);

  // Let the markdown command handle Enter
  if (insertNewlineContinueMarkup(view)) {
    // Fix indent on the new line
    const newPos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(newPos);
    if (!line.text.startsWith(baseIndent)) {
      view.dispatch({
        changes: { from: line.from, insert: baseIndent },
        selection: { anchor: newPos + baseIndent.length },
      });
    }
    return true;
  }

  return false;
};

export function notesLang(): LanguageSupport {
  return new LanguageSupport(notesLanguage, [
    mdSupport.support,
    stringIndent,
    // Must be higher priority than the markdown keymap (which uses Prec.high)
    Prec.highest(keymap.of([{ key: "Enter", run: wrappedMarkdownEnter }])),
  ]);
}
