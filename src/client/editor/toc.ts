import { syntaxTree } from "@codemirror/language";
import { Annotation, type Extension, Transaction } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode, Tree } from "@lezer/common";
import { nodeText } from "../../shared/parser/util.js";

const tocAutoAnnotation = Annotation.define<boolean>();

function getArguments(node: SyntaxNode): SyntaxNode[] {
  const args: SyntaxNode[] = [];
  for (const s of node.getChildren("Symbol").slice(1)) args.push(s);
  for (const s of node.getChildren("String")) args.push(s);
  for (const l of node.getChildren("List")) args.push(l);
  for (const m of node.getChildren("Map")) args.push(m);
  for (const v of node.getChildren("Vector")) args.push(v);
  for (const k of node.getChildren("Keyword")) args.push(k);
  args.sort((a, b) => a.from - b.from);
  return args;
}

function buildTocEntry(
  node: SyntaxNode,
  source: string,
  indent: string,
): string | null {
  const args = getArguments(node);
  const symbols = node.getChildren("Symbol");
  const verb = symbols[0];
  if (!verb) return null;
  const verbText = nodeText(source, verb);

  const firstArg = args[0];
  const hasStringTitle = firstArg?.name === "String";

  const childEntries: string[] = [];
  for (const arg of args) {
    if (arg.name === "List") {
      const entry = buildTocEntry(arg, source, `${indent}  `);
      if (entry) childEntries.push(entry);
    }
  }

  if (hasStringTitle) {
    if (args.length <= 1 && childEntries.length === 0) return null;
    let firstArgText = nodeText(source, firstArg);
    // Truncate multiline strings to first line, and cap length for the TOC
    const nlIdx = firstArgText.indexOf("\n");
    if (nlIdx !== -1) firstArgText = `${firstArgText.slice(0, nlIdx)}"`;
    const maxLen = 80;
    if (firstArgText.length > maxLen)
      firstArgText = `${firstArgText.slice(0, maxLen - 4)}..."`;
    if (childEntries.length === 0) {
      return `${indent}(${verbText} ${firstArgText})`;
    }
    return `${indent}(${verbText} ${firstArgText}\n${childEntries.join("\n")})`;
  }

  // Container form without a string title (e.g. (origines (recit "### ..." ...)))
  if (childEntries.length === 0) return null;
  return `${indent}(${verbText}\n${childEntries.join("\n")})`;
}

export interface TocResult {
  tocFrom: number;
  tocTo: number;
  replaceFrom: number;
  replaceTo: number;
  newContent: string;
}

export function generateTocContent(
  tree: Tree,
  source: string,
): TocResult | null {
  let tocNode: SyntaxNode | null = null;

  tree.iterate({
    enter(node) {
      if (tocNode) return false;
      if (node.name !== "List") return;
      const syms = node.node.getChildren("Symbol");
      if (syms[0] && nodeText(source, syms[0]) === "toc") {
        tocNode = node.node;
        return false;
      }
    },
  });

  if (!tocNode) return null;
  const tn = tocNode as SyntaxNode;
  const parent = tn.parent;
  if (!parent) return null;

  const tocLine = source.lastIndexOf("\n", tn.from);
  const tocCol = tn.from - (tocLine === -1 ? 0 : tocLine + 1);
  const entryIndent = " ".repeat(tocCol + 2);

  const siblings: SyntaxNode[] = [];
  for (const child of parent.getChildren("List")) {
    if (child.from > tn.to) {
      siblings.push(child);
    }
  }

  const entries: string[] = [];
  for (const sibling of siblings) {
    const entry = buildTocEntry(sibling, source, entryIndent);
    if (entry) entries.push(entry);
  }

  const tocSymbol = tn.getChildren("Symbol")[0];
  if (!tocSymbol) return null;

  const replaceFrom = tocSymbol.to;
  const replaceTo = tn.to - 1;
  const newContent = entries.length > 0 ? `\n${entries.join("\n")}` : "";

  return {
    tocFrom: tn.from,
    tocTo: tn.to,
    replaceFrom,
    replaceTo,
    newContent,
  };
}

const tocPlugin = ViewPlugin.fromClass(
  class {
    private pending: ReturnType<typeof setTimeout> | null = null;

    constructor(view: EditorView) {
      // Run on initial load so an existing (toc) gets populated
      this.schedule(view);
    }

    update(update: ViewUpdate) {
      if (!update.docChanged) return;
      if (update.transactions.some((tr) => tr.annotation(tocAutoAnnotation)))
        return;
      this.schedule(update.view);
    }

    schedule(view: EditorView) {
      if (this.pending) clearTimeout(this.pending);
      this.pending = setTimeout(() => {
        this.pending = null;
        this.maybeUpdate(view);
      }, 200);
    }

    maybeUpdate(view: EditorView) {
      const tree = syntaxTree(view.state);
      if (tree.length < view.state.doc.length) {
        this.schedule(view);
        return;
      }

      const source = view.state.doc.toString();
      const result = generateTocContent(tree, source);
      if (!result) return;

      const currentContent = source.slice(result.replaceFrom, result.replaceTo);
      if (currentContent === result.newContent) return;

      view.dispatch({
        changes: {
          from: result.replaceFrom,
          to: result.replaceTo,
          insert: result.newContent,
        },
        annotations: [
          tocAutoAnnotation.of(true),
          Transaction.addToHistory.of(false),
        ],
      });
    }

    destroy() {
      if (this.pending) clearTimeout(this.pending);
    }
  },
);

export function tocAutoGen(): Extension {
  return tocPlugin;
}
