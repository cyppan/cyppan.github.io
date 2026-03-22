import { describe, expect, test } from "bun:test";
import { dedentString, unescapeString } from "./util.js";

describe("unescapeString", () => {
  test("strips surrounding quotes", () => {
    expect(unescapeString('"hello"')).toBe("hello");
  });

  test("handles escaped quotes", () => {
    expect(unescapeString('"hello \\"world\\""')).toBe('hello "world"');
  });

  test("handles newlines", () => {
    expect(unescapeString('"line1\\nline2"')).toBe("line1\nline2");
  });

  test("handles tabs", () => {
    expect(unescapeString('"a\\tb"')).toBe("a\tb");
  });

  test("handles backslashes", () => {
    expect(unescapeString('"a\\\\b"')).toBe("a\\b");
  });

  test("empty string", () => {
    expect(unescapeString('""')).toBe("");
  });
});

describe("dedentString", () => {
  test("single line unchanged", () => {
    expect(dedentString("hello world")).toBe("hello world");
  });

  test("empty string unchanged", () => {
    expect(dedentString("")).toBe("");
  });

  test("strips common indent from continuation lines", () => {
    expect(dedentString("first\n    second\n    third")).toBe(
      "first\nsecond\nthird",
    );
  });

  test("preserves relative indent", () => {
    expect(dedentString("first\n  a\n    b\n  c")).toBe("first\na\n  b\nc");
  });

  test("empty lines ignored for indent calculation", () => {
    expect(dedentString("first\n   a\n\n   b")).toBe("first\na\n\nb");
  });

  test("no indent to strip", () => {
    expect(dedentString("first\nsecond\nthird")).toBe("first\nsecond\nthird");
  });

  test("handles DSL code block indentation", () => {
    // Simulates content from: (code :ts "const x = 42;\n     console.log(x);")
    expect(dedentString("const x = 42;\n     console.log(x);")).toBe(
      "const x = 42;\nconsole.log(x);",
    );
  });

  test("whitespace-only continuation lines preserved as empty", () => {
    expect(dedentString("first\n   a\n   \n   b")).toBe("first\na\n\nb");
  });
});
