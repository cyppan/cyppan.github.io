import { describe, expect, test } from "bun:test";
import { parser } from "./parser.js";

function parse(input: string): string {
  return parser.parse(input).toString();
}

describe("atoms", () => {
  test("symbol", () => {
    expect(parse("foo")).toBe("Program(Symbol)");
  });

  test("symbol with hyphens", () => {
    expect(parse("my-note-slug")).toBe("Program(Symbol)");
  });

  test("quoted symbol", () => {
    expect(parse("'hello-world")).toBe("Program(QuotedSymbol)");
  });

  test("quoted symbol simple", () => {
    expect(parse("'foo")).toBe("Program(QuotedSymbol)");
  });

  test("keyword", () => {
    expect(parse(":bar")).toBe("Program(Keyword)");
  });

  test("namespaced keyword", () => {
    expect(parse("::bar")).toBe("Program(Keyword)");
  });

  test("number integer", () => {
    expect(parse("42")).toBe("Program(Number)");
  });

  test("number negative", () => {
    expect(parse("-3")).toBe("Program(Number)");
  });

  test("number decimal", () => {
    expect(parse("3.14")).toBe("Program(Number)");
  });

  test("string", () => {
    expect(parse('"hello"')).toBe("Program(String(StringContent))");
  });

  test("empty string", () => {
    expect(parse('""')).toBe("Program(String)");
  });

  test("string with escapes", () => {
    expect(parse('"hello \\"world\\""')).toBe("Program(String(StringContent))");
  });

  test("multiline string", () => {
    expect(parse('"line one\n   line two"')).toBe(
      "Program(String(StringContent))",
    );
  });

  test("boolean true", () => {
    expect(parse("true")).toBe("Program(Boolean)");
  });

  test("boolean false", () => {
    expect(parse("false")).toBe("Program(Boolean)");
  });

  test("nil", () => {
    expect(parse("nil")).toBe("Program(Nil)");
  });
});

describe("collections", () => {
  test("empty list", () => {
    expect(parse("()")).toContain("List");
  });

  test("list with elements", () => {
    const result = parse("(foo bar)");
    expect(result).toContain("Symbol");
    expect(result).toContain("List");
  });

  test("empty vector", () => {
    expect(parse("[]")).toContain("Vector");
  });

  test("vector with elements", () => {
    const result = parse("[1 2 3]");
    expect(result).toContain("Vector");
    expect(result).toContain("Number");
  });

  test("empty map", () => {
    expect(parse("{}")).toContain("Map");
  });

  test("map with key-value pairs", () => {
    const result = parse("{:a 1 :b 2}");
    expect(result).toContain("Map");
    expect(result).toContain("Keyword");
    expect(result).toContain("Number");
  });

  test("nested collections", () => {
    const result = parse("{:a [1 2]}");
    expect(result).toContain("Map");
    expect(result).toContain("Vector");
  });

  test("deeply nested", () => {
    const tree = parser.parse("((()))");
    // Three nested Lists
    let depth = 0;
    const cursor = tree.cursor();
    do {
      if (cursor.name === "List") depth++;
    } while (cursor.next());
    expect(depth).toBe(3);
  });
});

describe("comments", () => {
  test("line comment appears in tree", () => {
    const result = parse("; this is a comment\nfoo");
    expect(result).toContain("LineComment");
    expect(result).toContain("Symbol");
  });

  test("comment only", () => {
    expect(parse("; just a comment")).toContain("LineComment");
  });
});

describe("discard", () => {
  test("discard form", () => {
    const tree = parser.parse("#_ foo bar");
    const discard = tree.topNode.getChild("Discard");
    expect(discard).not.toBeNull();
    // The discarded expression is a Symbol
    const discarded = discard?.getChild("Symbol");
    expect(discarded).not.toBeNull();
    // "bar" is a sibling, not inside Discard
    const symbols = tree.topNode.getChildren("Symbol");
    expect(symbols.length).toBe(1);
  });

  test("discard nested form", () => {
    const tree = parser.parse("#_ (a b) c");
    const discard = tree.topNode.getChild("Discard");
    expect(discard).not.toBeNull();
    const list = discard?.getChild("List");
    expect(list).not.toBeNull();
  });
});

describe("commas as whitespace", () => {
  test("commas treated as whitespace", () => {
    const tree = parser.parse("{:a 1, :b 2}");
    const map = tree.topNode.getChild("Map");
    if (!map) return expect(map).not.toBeNull();
    expect(map.getChildren("Keyword").length).toBe(2);
    expect(map.getChildren("Number").length).toBe(2);
  });
});

describe("full defnote form", () => {
  test("minimal defnote", () => {
    const input = `(defnote 'hello-world
  {:tags [:test]
   :created "2026-03-20"}

  "# Hello World")`;

    const tree = parser.parse(input);
    const topList = tree.topNode.getChild("List");
    if (!topList) return expect(topList).not.toBeNull();

    // Symbol: "defnote", QuotedSymbol: "'hello-world"
    const symbols = topList.getChildren("Symbol");
    expect(symbols.length).toBe(1);
    expect(input.slice(symbols[0]?.from, symbols[0]?.to)).toBe("defnote");

    const quoted = topList.getChildren("QuotedSymbol");
    expect(quoted.length).toBe(1);
    expect(input.slice(quoted[0]?.from, quoted[0]?.to)).toBe("'hello-world");

    // Metadata map
    expect(topList.getChild("Map")).not.toBeNull();

    // String block
    expect(topList.getChildren("String").length).toBe(1);
  });
});
