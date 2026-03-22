import { describe, expect, test } from "bun:test";
import { extractMetadata, parseNote } from "./parse.ts";

describe("parseNote", () => {
  test("minimal note", () => {
    const source = `(defnote hello-world
  {:tags [:test]
   :created "2026-03-20"}

  "# Hello World

   A minimal test note.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.slug).toBe("hello-world");
    expect(result.note.metadata.tags).toEqual(["test"]);
    expect(result.note.metadata.created).toBe("2026-03-20");
    expect(result.note.metadata.title).toBe("Hello World");
    expect(result.note.metadata.public).toBe(false);
  });

  test("full metadata", () => {
    const source = `(defnote my-note
  {:tags [:architecture :personal-tools]
   :public true
   :created "2026-03-20"}

  "# My Note Title")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.slug).toBe("my-note");
    expect(result.note.metadata.tags).toEqual([
      "architecture",
      "personal-tools",
    ]);
    expect(result.note.metadata.public).toBe(true);
    expect(result.note.metadata.created).toBe("2026-03-20");
    expect(result.note.metadata.title).toBe("My Note Title");
  });

  test("no title in string block", () => {
    const source = `(defnote no-title
  {:tags [:test]
   :created "2026-03-20"}

  "Just some text without a heading.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.title).toBeNull();
  });

  test("no metadata map", () => {
    const source = `(defnote bare-note "# Bare Note")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.slug).toBe("bare-note");
    expect(result.note.metadata.tags).toEqual([]);
    expect(result.note.metadata.public).toBe(false);
    expect(result.note.metadata.created).toBe("");
    expect(result.note.metadata.title).toBe("Bare Note");
  });

  test("multiple string blocks — title from first", () => {
    const source = `(defnote multi
  {:tags [] :created "2026-01-01"}

  "# First Heading"

  "# Second Heading")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.title).toBe("First Heading");
  });

  test("empty file returns error", () => {
    const result = parseNote("");
    expect(result.ok).toBe(false);
  });

  test("not a defnote form returns error", () => {
    const result = parseNote("(something-else foo)");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("defnote");
  });

  test("no slug returns error", () => {
    const result = parseNote("(defnote)");
    expect(result.ok).toBe(false);
  });
});

describe("extractMetadata", () => {
  test("returns metadata on valid input", () => {
    const source = `(defnote test-note
  {:tags [:a :b] :public true :created "2026-03-20"}
  "# Test Note")`;

    const meta = extractMetadata(source);
    expect(meta).not.toBeNull();
    expect(meta?.slug).toBe("test-note");
    expect(meta?.tags).toEqual(["a", "b"]);
    expect(meta?.public).toBe(true);
  });

  test("returns null on invalid input", () => {
    expect(extractMetadata("")).toBeNull();
    expect(extractMetadata("not a note")).toBeNull();
  });
});

describe("sample files", () => {
  test("creating-a-note-system.edn", async () => {
    const source = await Bun.file("notes/creating-a-note-system.edn").text();
    const meta = extractMetadata(source);
    expect(meta).not.toBeNull();
    expect(meta?.slug).toBe("creating-a-note-system");
    expect(meta?.tags).toEqual(["architecture", "personal-tools"]);
    expect(meta?.public).toBe(true);
    expect(meta?.created).toBe("2026-03-20");
    expect(meta?.title).toBe("Creating an innovative note system");
  });

  test("hello-world.edn", async () => {
    const source = await Bun.file("notes/hello-world.edn").text();
    const meta = extractMetadata(source);
    expect(meta).not.toBeNull();
    expect(meta?.slug).toBe("hello-world");
    expect(meta?.tags).toEqual(["test"]);
    expect(meta?.public).toBe(false);
    expect(meta?.title).toBe("Hello World");
  });

  test("kitchen-sink.edn", async () => {
    const source = await Bun.file("notes/kitchen-sink.edn").text();
    const meta = extractMetadata(source);
    expect(meta).not.toBeNull();
    expect(meta?.slug).toBe("kitchen-sink");
    expect(meta?.tags).toEqual(["test", "edge-cases"]);
    expect(meta?.public).toBe(false);
    expect(meta?.title).toBe("Kitchen Sink");
  });
});
