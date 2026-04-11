import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildIndex,
  deleteNote,
  hasNote,
  initIndex,
  isValidSlug,
  NoteNotFoundError,
  NoteParseError,
  readNote,
  slugify,
  writeNote,
} from "./notes.ts";

const VALID_NOTE = `(defnote "Test Note"
  {:slug 'test-note
   :tags [:test]
   :public true
   :ai-contribution :level-2
   :created "2026-03-20"}

  "Some content.")
`;

const VALID_NOTE_2 = `(defnote "Second Note"
  {:slug 'second-note
   :tags [:demo]
   :public true
   :ai-contribution :level-0
   :created "2026-03-19"})
`;

const PRIVATE_NOTE = `(defnote "Private Note"
  {:slug 'private-note
   :tags [:secret]
   :ai-contribution :level-1
   :created "2026-03-21"}

  "Private content.")
`;

const MALFORMED_NOTE = `(not-a-defnote broken`;

// --- Helpers ---

describe("isValidSlug", () => {
  test("accepts simple slugs", () => {
    expect(isValidSlug("hello")).toBe(true);
    expect(isValidSlug("hello-world")).toBe(true);
    expect(isValidSlug("my-note-123")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
  });

  test("rejects invalid slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Hello")).toBe(false);
    expect(isValidSlug("hello world")).toBe(false);
    expect(isValidSlug("hello_world")).toBe(false);
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("double--dash")).toBe(false);
    expect(isValidSlug("special!chars")).toBe(false);
  });
});

describe("slugify", () => {
  test("converts title to slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("My Note Title")).toBe("my-note-title");
  });

  test("handles special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("What's up?")).toBe("what-s-up");
    expect(slugify("  spaces  everywhere  ")).toBe("spaces-everywhere");
  });

  test("truncates long titles", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  test("handles edge cases", () => {
    expect(slugify("---")).toBe("");
    expect(slugify("123")).toBe("123");
  });
});

// --- Core functions ---

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "notes-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("buildIndex", () => {
  test("scans directory and returns metadata map", async () => {
    await Bun.write(path.join(tmpDir, "test-note.edn"), VALID_NOTE);
    await Bun.write(path.join(tmpDir, "second-note.edn"), VALID_NOTE_2);

    const idx = await buildIndex(tmpDir);

    expect(idx.size).toBe(2);
    expect(idx.get("test-note")?.metadata.slug).toBe("test-note");
    expect(idx.get("test-note")?.metadata.title).toBe("Test Note");
    expect(idx.get("test-note")?.metadata.tags).toEqual(["test"]);
    expect(idx.get("test-note")?.metadata.public).toBe(true);
    expect(idx.get("second-note")?.metadata.public).toBe(true);
  });

  test("skips malformed files", async () => {
    await Bun.write(path.join(tmpDir, "good.edn"), VALID_NOTE);
    await Bun.write(path.join(tmpDir, "bad.edn"), MALFORMED_NOTE);

    const idx = await buildIndex(tmpDir);

    expect(idx.size).toBe(1);
    expect(idx.has("test-note")).toBe(true);
  });

  test("returns empty map for empty directory", async () => {
    const idx = await buildIndex(tmpDir);
    expect(idx.size).toBe(0);
  });
});

describe("readNote", () => {
  test("returns source and metadata for existing note", async () => {
    await Bun.write(path.join(tmpDir, "test-note.edn"), VALID_NOTE);

    const result = await readNote(tmpDir, "test-note");

    expect(result.source).toBe(VALID_NOTE);
    expect(result.metadata?.slug).toBe("test-note");
    expect(result.metadata?.title).toBe("Test Note");
  });

  test("throws NoteNotFoundError for missing note", async () => {
    expect(readNote(tmpDir, "nonexistent")).rejects.toThrow(NoteNotFoundError);
  });

  test("returns null metadata for malformed note", async () => {
    await Bun.write(path.join(tmpDir, "bad.edn"), MALFORMED_NOTE);

    const result = await readNote(tmpDir, "bad");

    expect(result.source).toBe(MALFORMED_NOTE);
    expect(result.metadata).toBeNull();
  });
});

describe("writeNote", () => {
  test("writes valid source and returns metadata", async () => {
    const metadata = await writeNote(tmpDir, "test-note", VALID_NOTE);

    expect(metadata.slug).toBe("test-note");
    expect(metadata.title).toBe("Test Note");

    // Verify file was written
    const content = await Bun.file(path.join(tmpDir, "test-note.edn")).text();
    expect(content).toBe(VALID_NOTE);
  });

  test("rejects invalid source with NoteParseError", async () => {
    expect(writeNote(tmpDir, "bad", MALFORMED_NOTE)).rejects.toThrow(
      NoteParseError,
    );
  });

  test("overwrites existing file", async () => {
    await Bun.write(path.join(tmpDir, "test-note.edn"), VALID_NOTE);

    const updated = VALID_NOTE.replace("Some content.", "Updated content.");
    await writeNote(tmpDir, "test-note", updated);

    const content = await Bun.file(path.join(tmpDir, "test-note.edn")).text();
    expect(content).toBe(updated);
  });
});

describe("deleteNote", () => {
  test("deletes existing note", async () => {
    await Bun.write(path.join(tmpDir, "test-note.edn"), VALID_NOTE);

    await deleteNote(tmpDir, "test-note");

    const exists = await Bun.file(path.join(tmpDir, "test-note.edn")).exists();
    expect(exists).toBe(false);
  });

  test("throws NoteNotFoundError for missing note", async () => {
    expect(deleteNote(tmpDir, "nonexistent")).rejects.toThrow(
      NoteNotFoundError,
    );
  });
});

// --- Private directory support ---

describe("private notes", () => {
  test("buildIndex scans both root and private dirs", async () => {
    const privateDir = path.join(tmpDir, "private");
    await Bun.$`mkdir -p ${privateDir}`.quiet();

    await Bun.write(path.join(tmpDir, "test-note.edn"), VALID_NOTE);
    await Bun.write(path.join(privateDir, "private-note.edn"), PRIVATE_NOTE);

    const idx = await buildIndex(tmpDir);

    expect(idx.size).toBe(2);
    expect(idx.get("test-note")?.metadata.title).toBe("Test Note");
    expect(idx.get("private-note")?.metadata.title).toBe("Private Note");
  });

  test("writeNote puts private notes in private dir", async () => {
    await initIndex(tmpDir);

    await writeNote(tmpDir, "private-note", PRIVATE_NOTE);

    const privateFile = Bun.file(
      path.join(tmpDir, "private", "private-note.edn"),
    );
    expect(await privateFile.exists()).toBe(true);

    const rootFile = Bun.file(path.join(tmpDir, "private-note.edn"));
    expect(await rootFile.exists()).toBe(false);
  });

  test("writeNote puts public notes in root dir", async () => {
    await initIndex(tmpDir);

    await writeNote(tmpDir, "test-note", VALID_NOTE);

    const rootFile = Bun.file(path.join(tmpDir, "test-note.edn"));
    expect(await rootFile.exists()).toBe(true);

    const privateFile = Bun.file(path.join(tmpDir, "private", "test-note.edn"));
    expect(await privateFile.exists()).toBe(false);
  });

  test("writeNote moves note when public flag changes", async () => {
    await initIndex(tmpDir);

    await writeNote(tmpDir, "private-note", PRIVATE_NOTE);
    expect(
      await Bun.file(path.join(tmpDir, "private", "private-note.edn")).exists(),
    ).toBe(true);

    const madePublic = PRIVATE_NOTE.replace(
      ":created",
      ":public true\n   :created",
    );
    await writeNote(tmpDir, "private-note", madePublic);

    expect(await Bun.file(path.join(tmpDir, "private-note.edn")).exists()).toBe(
      true,
    );
    expect(
      await Bun.file(path.join(tmpDir, "private", "private-note.edn")).exists(),
    ).toBe(false);
  });

  test("readNote finds private notes", async () => {
    await initIndex(tmpDir);

    await writeNote(tmpDir, "private-note", PRIVATE_NOTE);
    const result = await readNote(tmpDir, "private-note");

    expect(result.source).toBe(PRIVATE_NOTE);
    expect(result.metadata?.slug).toBe("private-note");
  });

  test("deleteNote removes private notes", async () => {
    await initIndex(tmpDir);

    await writeNote(tmpDir, "private-note", PRIVATE_NOTE);
    await deleteNote(tmpDir, "private-note");

    expect(
      await Bun.file(path.join(tmpDir, "private", "private-note.edn")).exists(),
    ).toBe(false);
    expect(hasNote("private-note")).toBe(false);
  });

  test("hasNote works for both public and private", async () => {
    await initIndex(tmpDir);

    await writeNote(tmpDir, "test-note", VALID_NOTE);
    await writeNote(tmpDir, "private-note", PRIVATE_NOTE);

    expect(hasNote("test-note")).toBe(true);
    expect(hasNote("private-note")).toBe(true);
    expect(hasNote("nonexistent")).toBe(false);
  });
});
