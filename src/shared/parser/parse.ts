import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "./parser.js";
import { nodeText, unescapeString } from "./util.js";

export interface NoteMetadata {
  slug: string;
  tags: string[];
  public: boolean;
  created: string;
  aiContribution: number;
  title: string;
  preview: string | null;
  previewImage: string | null;
  previewSource: string | null;
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

/** Walk children of a Map node and extract key-value pairs */
function parseMetadataMap(
  source: string,
  mapNode: SyntaxNode,
): {
  slug: string | null;
  tags: string[];
  public: boolean;
  created: string;
  aiContribution: number | null;
} {
  const result = {
    slug: null as string | null,
    tags: [] as string[],
    public: false,
    created: "",
    aiContribution: null as number | null,
  };

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
      case ":slug": {
        if (value.name === "QuotedSymbol") {
          result.slug = nodeText(source, value).slice(1);
        }
        break;
      }
      case ":created": {
        if (value.name === "String") {
          result.created = unescapeString(nodeText(source, value));
        }
        break;
      }
      case ":ai-contribution": {
        if (value.name === "Keyword") {
          const match = nodeText(source, value).match(/^:level-(\d+)$/);
          if (match?.[1]) {
            const level = parseInt(match[1], 10);
            if (level >= 0 && level <= 10) {
              result.aiContribution = level;
            }
          }
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

  // First Symbol should be "defnote"
  const defnoteSymbol = defnoteNode.getChild("Symbol");
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

  // First String child is the title
  const titleNode = defnoteNode.getChild("String");
  if (!titleNode) {
    return {
      ok: false,
      errors: [
        {
          message: "Expected title string after defnote",
          from: defnoteNode.from,
          to: defnoteNode.to,
        },
      ],
    };
  }
  const title = unescapeString(nodeText(source, titleNode));

  // Look for metadata Map (must contain :slug)
  let meta = {
    slug: null as string | null,
    tags: [] as string[],
    public: false,
    created: "",
    aiContribution: null as number | null,
  };
  const mapNode = defnoteNode.getChild("Map");
  if (mapNode) {
    meta = parseMetadataMap(source, mapNode);
  }

  if (!meta.slug) {
    return {
      ok: false,
      errors: [
        {
          message: "Expected :slug in metadata map",
          from: mapNode?.from ?? defnoteNode.from,
          to: mapNode?.to ?? defnoteNode.to,
        },
      ],
    };
  }
  const slug = meta.slug;

  if (meta.aiContribution == null) {
    return {
      ok: false,
      errors: [
        {
          message:
            "Expected :ai-contribution in metadata map (keyword :level-0 to :level-10)",
          from: mapNode?.from ?? defnoteNode.from,
          to: mapNode?.to ?? defnoteNode.to,
        },
      ],
    };
  }
  const aiContribution = meta.aiContribution;

  // Extract (preview ...) form
  let preview: string | null = null;
  let previewImage: string | null = null;
  let previewSource: string | null = null;
  for (const list of defnoteNode.getChildren("List")) {
    const syms = list.getChildren("Symbol");
    if (syms[0] && nodeText(source, syms[0]) === "preview") {
      // Raw inner source (everything after "preview" symbol, before closing paren)
      previewSource = source.slice(syms[0].to, list.to - 1).trim();

      // Flat text from first String child (for OG description)
      const previewStrings = list.getChildren("String");
      if (previewStrings[0]) {
        preview = unescapeString(nodeText(source, previewStrings[0])).trim();
      }
      // First media src (for OG image)
      for (const inner of list.getChildren("List")) {
        const innerSyms = inner.getChildren("Symbol");
        if (innerSyms[0] && nodeText(source, innerSyms[0]) === "media") {
          const mapChild = inner.getChild("Map");
          if (mapChild) {
            for (const kw of mapChild.getChildren("Keyword")) {
              if (nodeText(source, kw) === ":src") {
                const val = kw.nextSibling;
                if (val?.name === "String") {
                  previewImage = unescapeString(nodeText(source, val));
                }
              }
            }
          }
          break;
        }
      }
      break;
    }
  }

  const metadata: NoteMetadata = {
    slug,
    tags: meta.tags,
    public: meta.public,
    created: meta.created,
    aiContribution,
    title,
    preview,
    previewImage,
    previewSource,
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
