import { describe, expect, test } from "bun:test";
import { ensureSyntaxTree, getIndentation } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { Input } from "@lezer/common";
import { NodeProp } from "@lezer/common";
import { highlightTree } from "@lezer/highlight";
import { computeDedentOverlays, notesLang } from "./language.js";
import { notesHighlightExt, testHighlightStyle } from "./theme.js";
import { generateTocContent } from "./toc.js";

// Minimal Input implementation for testing computeDedentOverlays
function stringInput(text: string): Input {
  return {
    length: text.length,
    lineChunks: false,
    read(from: number, to: number) {
      return text.slice(from, to);
    },
    chunk(from: number) {
      return text.slice(from);
    },
  };
}

// Helper: create an EditorState with our language extensions and wait for parsing
function makeState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [notesLang(), notesHighlightExt],
  });
}

// Helper: get indent for a given line number (1-based)
// Uses line.from — the start of the line (before any content)
function indentAt(state: EditorState, lineNumber: number): number | null {
  const line = state.doc.line(lineNumber);
  return getIndentation(state, line.from);
}

// Helper: get indent at a specific position (for testing mid-line positions)
function indentAtPos(state: EditorState, pos: number): number | null {
  return getIndentation(state, pos);
}

// Helper: get the column of the first occurrence of a char on a line
function colOf(state: EditorState, lineNumber: number, char: string): number {
  const line = state.doc.line(lineNumber);
  const idx = line.text.indexOf(char);
  return idx;
}

// ---------- Indentation ----------

describe("indentation: List (parens)", () => {
  const doc = `(defnote test
  {:tags [:test]
   :created "2026-03-20"}

  "# Hello")`;

  test("body forms indent 2 spaces from (", () => {
    const state = makeState(doc);
    // Line 2 is `  {:tags [:test]` — should be indented 2 from column 0
    expect(indentAt(state, 2)).toBe(2);
  });

  test("closing ) aligns with opening (", () => {
    const doc2 = `(defnote test
  "hello"
)`;
    const state2 = makeState(doc2);
    expect(indentAt(state2, 3)).toBe(0);
  });
});

describe("indentation: Vector (brackets)", () => {
  test("content aligns with first item after [", () => {
    const state = makeState(`(defnote test
  {:tags [:architecture
          :tools]})`);
    // Line 3: `:tools` should align with `:architecture`
    // `[` is at column 9, `:architecture` at column 10 (= [ + 1)
    expect(indentAt(state, 3)).toBe(10);
  });
});

describe("indentation: Map (braces)", () => {
  test("keys align after {", () => {
    const state = makeState(`(defnote test
  {:tags []
   :created "2026-03-20"})`);
    // Line 3: `:created` should align with `:tags` (column after `{`)
    expect(indentAt(state, 3)).toBe(colOf(state, 2, ":"));
  });
});

describe("indentation: String (quotes)", () => {
  const doc = `(defnote test
  {:created "2026-03-20"}

  "# Hello World

   Some text here.
   More text.")`;

  test("opening line of string: Enter inside string → quote column + 1", () => {
    const state = makeState(doc);
    // `"` on line 4 is at column 2
    const quoteCol = colOf(state, 4, '"');
    expect(quoteCol).toBe(2);
    // When pressing Enter inside the string on the opening line,
    // pos is INSIDE the String (e.g. after `"# Hello World`).
    // indentAt(line.from) is BEFORE the `"`, so it's in List context.
    // We need to test at a position inside the String content.
    const line4 = state.doc.line(4);
    const quotePos = line4.from + quoteCol;
    // pos after the `"` is inside the String
    expect(indentAtPos(state, quotePos + 1)).toBe(quoteCol + 1);
    // pos at end of line is also inside the String
    expect(indentAtPos(state, line4.to)).toBe(quoteCol + 1);
  });

  test("inner line of string: quote column + 1", () => {
    const state = makeState(doc);
    const quoteCol = colOf(state, 4, '"');
    // Line 5 (empty line inside string) should indent at quoteCol + 1 = 3
    expect(indentAt(state, 5)).toBe(quoteCol + 1);
  });

  test("subsequent lines inside string: quote column + 1", () => {
    const state = makeState(doc);
    const quoteCol = colOf(state, 4, '"');
    // Line 6 (`   Some text here.`) should be at quoteCol + 1 = 3
    expect(indentAt(state, 6)).toBe(quoteCol + 1);
  });

  test("inside blockquote: quote column + 1", () => {
    const doc2 = `(defnote test
  "# Hello

   > a blockquote

   Normal.")`;
    const state = makeState(doc2);
    const quoteCol = colOf(state, 2, '"');
    // Line inside the blockquote (line 4: "   > a blockquote")
    expect(indentAt(state, 4)).toBe(quoteCol + 1);
    // Line after the blockquote (line 5: empty)
    expect(indentAt(state, 5)).toBe(quoteCol + 1);
  });

  test("closing quote aligns with opening quote", () => {
    // Test with closing " on its own line
    const doc2 = `(defnote test
  "# Hello
  ")`;
    const state = makeState(doc2);
    const quoteCol = colOf(state, 2, '"');
    expect(indentAt(state, 3)).toBe(quoteCol);
  });
});

describe("indentation: nested structures", () => {
  test("vector inside map inside list", () => {
    const state = makeState(`(defnote test
  {:tags [:a
          :b]
   :created "2026-03-20"})`);
    // `:b` should align with `:a` — `[` at column 9, `:a` at column 10
    expect(indentAt(state, 3)).toBe(10);
    // `:created` should align with `:tags` — `{` at column 2, `:tags` at column 3
    expect(indentAt(state, 4)).toBe(3);
  });
});

describe("indentation: inside inline string", () => {
  test("Enter inside short string like date → should not leak to sibling indent", () => {
    // Use full kitchen-sink content to match real parsing
    const state = makeState(`;; This is a comment
(defnote kitchen-sink
  {:tags [:test :edge-cases]
   :created "2026-03-20"}

  "# Kitchen Sink

   Testing all the edge cases."

  (code :typescript
    "const x = 42;")

  (ref hello-world "See also: Hello World")

  (inspirations
    ["https://example.com"]))`);
    // Find the `:created "2026-03-20"}` line
    let dateLine = 0;
    for (let i = 1; i <= state.doc.lines; i++) {
      if (state.doc.line(i).text.includes("2026-03-20")) {
        dateLine = i;
        break;
      }
    }
    expect(dateLine).toBeGreaterThan(0);
    const line = state.doc.line(dateLine);
    const quotePos = line.from + line.text.indexOf('"');
    const posInside = quotePos + 5;
    const quoteCol = quotePos - line.from;
    // All strings indent at opening " + 1, including single-line ones
    expect(indentAtPos(state, posInside)).toBe(quoteCol + 1);
  });
});

describe("indentation: cursor at/after closing quote", () => {
  const doc = `(defnote test
  {:tags [:test]
   :created "2026-03-20"})`;

  test("at closing quote → NOT string indent", () => {
    const state = makeState(doc);
    const line3 = state.doc.line(3);
    const closingQuoteIdx = line3.text.lastIndexOf('"');
    const closingQuotePos = line3.from + closingQuoteIdx;
    // At the closing " itself — should NOT return string indent (13)
    expect(indentAtPos(state, closingQuotePos)).not.toBe(13);
  });

  test("after closing quote, before } → Map indent", () => {
    const state = makeState(doc);
    const line3 = state.doc.line(3);
    const closingBrace = line3.text.lastIndexOf("}");
    const posAfterString = line3.from + closingBrace;
    expect(indentAtPos(state, posAfterString)).toBe(2);
  });
});

// ---------- Folding ----------

// Test the ednFoldRange function directly by importing from fold.ts
// We test fold range computation, not the gutter rendering (which needs DOM)

describe("folding: fold ranges", () => {
  // We can't easily import ednFoldRange (it's not exported),
  // but we can test via the public fold API indirectly.
  // For now, just verify the state setup doesn't crash.
  test("editor state creates successfully with all extensions", () => {
    const doc = `(defnote test
  {:tags [:test]}
  "# Hello World")`;
    const state = makeState(doc);
    expect(state.doc.lines).toBe(3);
  });
});

// ---------- Markdown overlay parsing ----------

describe("markdown parsing inside strings", () => {
  test("blockquote is parsed in multiline string", () => {
    const doc = `(defnote test
  {:tags [:test]}

  "# Hello World

   > a quote

   Normal text.")`;
    const state = makeState(doc);
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    expect(tree).toBeDefined();

    // Collect node names including overlay-mounted trees
    const nodeNames: string[] = [];
    tree?.iterate({
      enter(node) {
        nodeNames.push(node.name);
        const mounted = node.tree?.prop(NodeProp.mounted);
        if (mounted?.overlay && mounted.tree) {
          mounted.tree.iterate({
            enter(inner) {
              nodeNames.push(inner.name);
            },
          });
        }
      },
    });

    expect(nodeNames.some((n) => n === "Blockquote")).toBe(true);
  });

  test("highlightTree produces spans for blockquote content", () => {
    const doc = `(defnote test
  "# Hello

   > a quote

   Normal.")`;
    const state = makeState(doc);
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    expect(tree).toBeDefined();
    if (!tree) return;

    const spans: { from: number; to: number; classes: string }[] = [];
    highlightTree(tree, testHighlightStyle, (from, to, classes) => {
      spans.push({ from, to, classes });
    });

    // Blockquote text should have a highlight class
    const quoteSpan = spans.find((s) =>
      doc.slice(s.from, s.to).includes("a quote"),
    );
    expect(quoteSpan).toBeDefined();
  });

  test("resolveInner at blockquote position finds Blockquote node", () => {
    const doc = `(defnote test
  "# Hello

   > a quote

   Normal.")`;
    const state = makeState(doc);
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    expect(tree).toBeDefined();
    if (!tree) return;

    const gtPos = doc.indexOf(">");
    const nodeAtGt = tree.resolveInner(gtPos, 1);

    // Walk parents — should find Blockquote in the chain
    let cur: typeof nodeAtGt | null = nodeAtGt;
    const parentChain: string[] = [];
    while (cur) {
      parentChain.push(cur.name);
      cur = cur.parent;
    }
    expect(parentChain).toContain("Blockquote");
  });

  test("resolveInner finds Blockquote when > is preceded by indentation", () => {
    const doc = `(defnote test
  "# Hello

   > an indented quote

   Normal.")`;
    const state = makeState(doc);
    const tree = ensureSyntaxTree(state, state.doc.length, 5000);
    expect(tree).toBeDefined();
    if (!tree) return;

    // Find the line containing "> an indented quote"
    const gtPos = doc.indexOf(">");
    const line = state.doc.lineAt(gtPos);

    // Reproduce the fix logic: skip leading whitespace, resolve at nonWS + 1
    const nonWS = line.text.search(/\S/);
    const resolveAt =
      nonWS >= 0 ? Math.min(line.from + nonWS + 1, line.to) : line.from;
    const node = tree.resolveInner(resolveAt);

    let cur: typeof node | null = node;
    const parentChain: string[] = [];
    while (cur) {
      parentChain.push(cur.name);
      cur = cur.parent;
    }
    expect(parentChain).toContain("Blockquote");
  });
});

// ---------- Dedent overlays ----------

describe("computeDedentOverlays", () => {
  test("returns undefined for single-line content", () => {
    const text = "hello world";
    const input = stringInput(text);
    expect(computeDedentOverlays(input, 0, text.length)).toBeUndefined();
  });

  test("returns undefined for empty content", () => {
    const input = stringInput("");
    expect(computeDedentOverlays(input, 0, 0)).toBeUndefined();
  });

  test("returns undefined when continuation lines have no indent", () => {
    const text = "heading\nparagraph\nmore";
    const input = stringInput(text);
    expect(computeDedentOverlays(input, 0, text.length)).toBeUndefined();
  });

  test("strips common indent from continuation lines", () => {
    const text = "## Heading\n   paragraph\n   more text";
    const input = stringInput(text);
    const overlays = computeDedentOverlays(input, 0, text.length);
    expect(overlays).toBeDefined();
    // First overlay: "## Heading\n"
    expect(overlays?.[0]).toEqual({ from: 0, to: 11 });
    // Second overlay: "paragraph\n" (skips 3 spaces at pos 11-13)
    expect(overlays?.[1]).toEqual({ from: 14, to: 24 });
    // Third overlay: "more text" (skips 3 spaces at pos 24-26)
    expect(overlays?.[2]).toEqual({ from: 27, to: text.length });
  });

  test("handles offset from/to (StringContent not at start of document)", () => {
    //                   0123456789...
    const text = 'prefix "## Heading\n   paragraph" suffix';
    const input = stringInput(text);
    // StringContent starts after the opening " at pos 8, ends before closing " at pos 31
    const from = 8; // "## Heading\n   paragraph"
    const to = 31;
    const overlays = computeDedentOverlays(input, from, to);
    expect(overlays).toBeDefined();
    // First overlay: "## Heading\n" (pos 8 to 19)
    expect(overlays?.[0]).toEqual({ from: 8, to: 19 });
    // Second overlay: "paragraph" (skips 3 spaces, pos 22 to 31)
    expect(overlays?.[1]).toEqual({ from: 22, to: 31 });
  });

  test("empty lines do not affect base indent calculation", () => {
    const text = "heading\n   para\n\n   more";
    const input = stringInput(text);
    const overlays = computeDedentOverlays(input, 0, text.length);
    expect(overlays).toBeDefined();
    // Base indent is 3 (from "   para" and "   more"), empty line ignored
    // First overlay: "heading\n"
    expect(overlays?.[0]).toEqual({ from: 0, to: 8 });
    // Second overlay: "para\n" (skips 3 spaces)
    expect(overlays?.[1]).toEqual({ from: 11, to: 16 });
    // Third overlay: "\n" (empty line — 0 spaces to strip, all included)
    expect(overlays?.[2]).toEqual({ from: 16, to: 17 });
    // Fourth overlay: "more" (skips 3 spaces)
    expect(overlays?.[3]).toEqual({ from: 20, to: text.length });
  });

  test("uses minimum indent when lines have different indentation", () => {
    const text = "heading\n  two\n    four\n  two";
    const input = stringInput(text);
    const overlays = computeDedentOverlays(input, 0, text.length);
    expect(overlays).toBeDefined();
    // Base indent = 2 (minimum of 2, 4, 2)
    // "heading\n"
    expect(overlays?.[0]).toEqual({ from: 0, to: 8 });
    // "two\n" (stripped 2)
    expect(overlays?.[1]).toEqual({ from: 10, to: 14 });
    // "  four\n" (stripped 2 of 4, leaving 2)
    expect(overlays?.[2]).toEqual({ from: 16, to: 23 });
    // "two" (stripped 2)
    expect(overlays?.[3]).toEqual({ from: 25, to: text.length });
  });
});

// ---------- TOC generation ----------

function tocState(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [notesLang(), notesHighlightExt],
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  if (!tree) throw new Error("Failed to parse tree");
  return { state, tree };
}

describe("generateTocContent", () => {
  test("generates TOC from h2/h3 structure", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (toc)

  (h2 "## First Section"
    "some content"
    (h3 "### Subsection A"
      "sub content"))

  (h2 "## Second Section"
    "more content"))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeDefined();
    expect(result?.newContent).toContain('(h2 "## First Section"');
    expect(result?.newContent).toContain('(h3 "### Subsection A")');
    expect(result?.newContent).toContain('(h2 "## Second Section")');
  });

  test("excludes leaf forms (single argument)", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (toc)

  (h2 "## Real Section"
    "content here")

  (solo "## Only One Arg"))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeDefined();
    expect(result?.newContent).toContain('(h2 "## Real Section")');
    expect(result?.newContent).not.toContain("solo");
  });

  test("excludes forms whose first arg is not a string", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (toc)

  (h2 "## Good Section"
    "content")

  (media {:src "/img.png" :alt "image"}))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeDefined();
    expect(result?.newContent).toContain('(h2 "## Good Section")');
    expect(result?.newContent).not.toContain("media");
  });

  test("replaces existing toc content", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (toc
    (old "## Stale Entry"))

  (h2 "## Fresh Section"
    "content"))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeDefined();
    expect(result?.newContent).toContain('(h2 "## Fresh Section")');
    expect(result?.newContent).not.toContain("old");
    expect(result?.newContent).not.toContain("Stale");
  });

  test("returns null when no toc form exists", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (h2 "## Section"
    "content"))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeNull();
  });

  test("works with arbitrary form names", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (toc)

  (references "## References"
    "book one"
    "book two"))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeDefined();
    expect(result?.newContent).toContain('(references "## References")');
  });

  test("produces correct indentation", () => {
    const doc = `(defnote "# Test"
  {:slug 'test :created "2026-01-01"}

  (toc)

  (h2 "## A"
    "content"
    (h3 "### B"
      "sub content")))`;
    const { tree } = tocState(doc);
    const result = generateTocContent(tree, doc);
    expect(result).toBeDefined();
    const lines = result?.newContent.split("\n") ?? [];
    // First line is empty (newline after "toc")
    expect(lines[0]).toBe("");
    // Top-level entry at tocCol(2) + 2 = 4 spaces
    expect(lines[1]).toMatch(/^ {4}\(h2 /);
    // Nested entry at 6 spaces
    expect(lines[2]).toMatch(/^ {6}\(h3 /);
  });
});
