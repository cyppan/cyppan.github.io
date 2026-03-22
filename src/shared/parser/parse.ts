import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "./parser.js";
import { nodeText, unescapeString } from "./util.js";

export interface NoteMetadata {
  slug: string;
  tags: string[];
  public: boolean;
  created: string;
  title: string | null;
}

export interface ParsedNote {
  metadata: NoteMetadata;
  source: string;
}

export interface ParseError {
  message: string;
  from: number;
  to: number;
}

export type ParseResult =
  | { ok: true; note: ParsedNote }
  | { ok: false; errors: ParseError[] };

/** Extract title from first markdown heading */
function extractTitle(content: string): string | null {
  const match = content.match(/^[\s]*#\s+(.+?)(?:\n|$)/m);
  return match?.[1]?.trim() ?? null;
}

/** Walk children of a Map node and extract key-value pairs */
function parseMetadataMap(
  source: string,
  mapNode: SyntaxNode,
): { tags: string[]; public: boolean; created: string } {
  const result = { tags: [] as string[], public: false, created: "" };

  // Get all Keyword children — each keyword is a key, its next named sibling is the value
  const keywords = mapNode.getChildren("Keyword");

  for (const kw of keywords) {
    const key = nodeText(source, kw);
    const value = kw.nextSibling;
    if (!value) continue;

    switch (key) {
      case ":tags": {
        if (value.name === "Vector") {
          for (const tagNode of value.getChildren("Keyword")) {
            result.tags.push(nodeText(source, tagNode).slice(1));
          }
        }
        break;
      }
      case ":public": {
        if (value.name === "Boolean") {
          result.public = nodeText(source, value) === "true";
        }
        break;
      }
      case ":created": {
        if (value.name === "String") {
          result.created = unescapeString(nodeText(source, value));
        }
        break;
      }
    }
  }

  return result;
}

function collectErrors(tree: Tree): ParseError[] {
  const errors: ParseError[] = [];
  const cursor = tree.cursor();
  do {
    if (cursor.type.isError) {
      errors.push({
        message: `Unexpected input at position ${cursor.from}`,
        from: cursor.from,
        to: cursor.to,
      });
    }
  } while (cursor.next());
  return errors;
}

function extractFromTree(tree: Tree, source: string): ParseResult {
  // Find first top-level List (the defnote form)
  const defnoteNode = tree.topNode.getChild("List");

  if (!defnoteNode) {
    return {
      ok: false,
      errors: [
        { message: "No top-level list found", from: 0, to: source.length },
      ],
    };
  }

  // Get all Symbol children of the defnote list
  const symbols = defnoteNode.getChildren("Symbol");

  // First Symbol should be "defnote"
  const defnoteSymbol = symbols[0];
  if (!defnoteSymbol || nodeText(source, defnoteSymbol) !== "defnote") {
    return {
      ok: false,
      errors: [
        {
          message: "Expected (defnote ...) form",
          from: defnoteNode.from,
          to: defnoteNode.to,
        },
      ],
    };
  }

  // Second Symbol is the slug
  const slugSymbol = symbols[1];
  if (!slugSymbol) {
    return {
      ok: false,
      errors: [
        {
          message: "Expected slug symbol after defnote",
          from: defnoteNode.from,
          to: defnoteNode.to,
        },
      ],
    };
  }
  const slug = nodeText(source, slugSymbol);

  // Look for metadata Map
  let meta = { tags: [] as string[], public: false, created: "" };
  const mapNode = defnoteNode.getChild("Map");
  if (mapNode) {
    meta = parseMetadataMap(source, mapNode);
  }

  // Find first String block for title extraction
  let title: string | null = null;
  const strings = defnoteNode.getChildren("String");
  const firstString = strings[0];
  if (firstString) {
    title = extractTitle(unescapeString(nodeText(source, firstString)));
  }

  const metadata: NoteMetadata = {
    slug,
    tags: meta.tags,
    public: meta.public,
    created: meta.created,
    title,
  };

  return { ok: true, note: { metadata, source } };
}

/** Parse a note source and extract metadata + validate structure */
export function parseNote(source: string): ParseResult {
  const tree = parser.parse(source);
  const errors = collectErrors(tree);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return extractFromTree(tree, source);
}

/** Lightweight metadata extraction — returns null on invalid input */
export function extractMetadata(source: string): NoteMetadata | null {
  const result = parseNote(source);
  if (!result.ok) return null;
  return result.note.metadata;
}
