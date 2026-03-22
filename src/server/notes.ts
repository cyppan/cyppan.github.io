import { type FSWatcher, watch } from "node:fs";
import path from "node:path";
import {
  extractMetadata,
  type NoteMetadata,
  type ParseError,
  parseNote,
} from "../shared/parser/parse.ts";

// --- Helpers ---

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// --- Errors ---

export class NoteNotFoundError extends Error {
  constructor(slug: string) {
    super(`Note not found: ${slug}`);
    this.name = "NoteNotFoundError";
  }
}

export class NoteParseError extends Error {
  errors: ParseError[];
  constructor(errors: ParseError[]) {
    super("Invalid note source");
    this.name = "NoteParseError";
    this.errors = errors;
  }
}

// --- Core functions ---

function notePath(notesDir: string, slug: string): string {
  return path.join(notesDir, `${slug}.edn`);
}

export async function buildIndex(
  notesDir: string,
): Promise<Map<string, NoteMetadata>> {
  const result = new Map<string, NoteMetadata>();
  const glob = new Bun.Glob("*.edn");

  for await (const filename of glob.scan({ cwd: notesDir })) {
    const filePath = path.join(notesDir, filename);
    try {
      const source = await Bun.file(filePath).text();
      const metadata = extractMetadata(source);
      if (metadata) {
        result.set(metadata.slug, metadata);
      } else {
        console.warn(`Skipping malformed note: ${filename}`);
      }
    } catch (err) {
      console.warn(`Error reading ${filename}:`, err);
    }
  }

  return result;
}

function sortedIndex(idx: Map<string, NoteMetadata>): NoteMetadata[] {
  return Array.from(idx.values()).sort((a, b) => {
    // Sort by created descending, then slug ascending as tiebreaker
    const dateCompare = b.created.localeCompare(a.created);
    if (dateCompare !== 0) return dateCompare;
    return a.slug.localeCompare(b.slug);
  });
}

export async function readNote(
  notesDir: string,
  slug: string,
): Promise<{ source: string; metadata: NoteMetadata | null }> {
  const filePath = notePath(notesDir, slug);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new NoteNotFoundError(slug);
  }

  const source = await file.text();
  const metadata = extractMetadata(source);
  return { source, metadata };
}

export async function writeNote(
  notesDir: string,
  slug: string,
  source: string,
): Promise<NoteMetadata> {
  const result = parseNote(source);
  if (!result.ok) {
    throw new NoteParseError(result.errors);
  }

  await Bun.write(notePath(notesDir, slug), source);

  // Update in-memory index
  const metadata = result.note.metadata;
  index.set(slug, metadata);

  return metadata;
}

export async function deleteNote(
  notesDir: string,
  slug: string,
): Promise<void> {
  const filePath = notePath(notesDir, slug);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    throw new NoteNotFoundError(slug);
  }

  await Bun.file(filePath).delete();

  // Update in-memory index
  index.delete(slug);
}

// --- In-memory index singleton ---

let index: Map<string, NoteMetadata> = new Map();
let watcher: FSWatcher | null = null;

export async function initIndex(notesDir: string): Promise<void> {
  index = await buildIndex(notesDir);
  console.log(`Index initialized: ${index.size} notes`);
}

export function getIndex(): NoteMetadata[] {
  return sortedIndex(index);
}

export function startWatcher(notesDir: string): void {
  if (watcher) {
    watcher.close();
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watcher = watch(notesDir, (_event, filename) => {
    if (!filename?.endsWith(".edn")) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const slug = filename.replace(/\.edn$/, "");
      const filePath = path.join(notesDir, filename);

      try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          const source = await file.text();
          const metadata = extractMetadata(source);
          if (metadata) {
            index.set(slug, metadata);
          }
        } else {
          index.delete(slug);
        }
      } catch {
        // File may have been removed between check and read
        index.delete(slug);
      }
    }, 100);
  });
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
