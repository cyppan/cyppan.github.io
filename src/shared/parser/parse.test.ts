import { describe, expect, test } from "bun:test";
import { extractMetadata, parseNote } from "./parse.ts";

describe("parseNote", () => {
  test("minimal note", () => {
    const source = `(defnote "Hello World"
  {:slug 'hello-world
   :tags [:test]
   :ai-contribution :level-2
   :created "2026-03-20"}

  "A minimal test note.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.slug).toBe("hello-world");
    expect(result.note.metadata.tags).toEqual(["test"]);
    expect(result.note.metadata.created).toBe("2026-03-20");
    expect(result.note.metadata.title).toBe("Hello World");
    expect(result.note.metadata.aiContribution).toBe(2);
  });

  test("full metadata", () => {
    const source = `(defnote "My Note Title"
  {:slug 'my-note
   :tags [:architecture :personal-tools]
   :ai-contribution :level-3
   :created "2026-03-20"}

  "Some content.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.note.metadata.slug).toBe("my-note");
    expect(result.note.metadata.tags).toEqual([
      "architecture",
      "personal-tools",
    ]);
    expect(result.note.metadata.created).toBe("2026-03-20");
    expect(result.note.metadata.title).toBe("My Note Title");
    expect(result.note.metadata.aiContribution).toBe(3);
  });

  test("no slug returns error", () => {
    const source = `(defnote "No Slug"
  {:tags [:test]
   :ai-contribution :level-0
   :created "2026-03-20"}

  "Some text.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain(":slug");
  });

  test("no ai-contribution returns error", () => {
    const source = `(defnote "No AI Level"
  {:slug 'no-ai-level
   :tags [:test]
   :created "2026-03-20"}

  "Some text.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain(":ai-contribution");
  });

  test("invalid ai-contribution returns error", () => {
    const source = `(defnote "Bad Level"
  {:slug 'bad-level
   :ai-contribution :level-11
   :created "2026-03-20"}

  "Some text.")`;

    const result = parseNote(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain(":ai-contribution");
  });

  test("ai-contribution boundary values", () => {
    for (const level of [0, 10]) {
      const source = `(defnote "Boundary"
  {:slug 'boundary
   :ai-contribution :level-${level}
   :created "2026-03-20"}

  "Content.")`;

      const result = parseNote(source);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.note.metadata.aiContribution).toBe(level);
    }
  });

  test("no title string returns error", () => {
    const source = `(defnote {:slug 'bare-note})`;

    const result = parseNote(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("title");
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

  test("no defnote form returns error", () => {
    const result = parseNote("(defnote)");
    expect(result.ok).toBe(false);
  });
});

describe("extractMetadata", () => {
  test("returns metadata on valid input", () => {
    const source = `(defnote "Test Note"
  {:slug 'test-note
   :tags [:a :b] :ai-contribution :level-4 :created "2026-03-20"})`;

    const meta = extractMetadata(source);
    expect(meta).not.toBeNull();
    expect(meta?.slug).toBe("test-note");
    expect(meta?.title).toBe("Test Note");
    expect(meta?.tags).toEqual(["a", "b"]);
    expect(meta?.aiContribution).toBe(4);
  });

  test("returns null on invalid input", () => {
    expect(extractMetadata("")).toBeNull();
    expect(extractMetadata("not a note")).toBeNull();
  });
});

describe("sample files", () => {
  test("ai-augmented-dev-a-mental-model.edn", async () => {
    const source = await Bun.file(
      "notes/ai-augmented-dev-a-mental-model.edn",
    ).text();
    const meta = extractMetadata(source);
    expect(meta).not.toBeNull();
    expect(meta?.slug).toBe("ai-augmented-dev-a-mental-model");
  });
});
