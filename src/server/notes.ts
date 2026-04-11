import { existsSync, type FSWatcher, watch } from "node:fs";
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

function privateDirPath(notesDir: string): string {
  return path.join(notesDir, "private");
}

export interface NoteEntry {
  metadata: NoteMetadata;
  source: string;
}

async function scanDir(
  dir: string,
  result: Map<string, NoteEntry>,
): Promise<void> {
  if (!existsSync(dir)) return;

  const glob = new Bun.Glob("*.edn");
  for await (const filename of glob.scan({ cwd: dir })) {
    const filePath = path.join(dir, filename);
    try {
      const source = await Bun.file(filePath).text();
      const metadata = extractMetadata(source);
      if (metadata) {
        result.set(metadata.slug, { metadata, source });
        noteDirs.set(metadata.slug, dir);
      } else {
        console.warn(`Skipping malformed note: ${filename}`);
      }
    } catch (err) {
      console.warn(`Error reading ${filename}:`, err);
    }
  }
}

export async function buildIndex(
  notesDir: string,
): Promise<Map<string, NoteEntry>> {
  const result = new Map<string, NoteEntry>();
  noteDirs.clear();

  await scanDir(notesDir, result);
  await scanDir(privateDirPath(notesDir), result);

  return result;
}

function sortedIndex(idx: Map<string, NoteEntry>): NoteEntry[] {
  return Array.from(idx.values()).sort((a, b) => {
    const dateCompare = b.metadata.created.localeCompare(a.metadata.created);
    if (dateCompare !== 0) return dateCompare;
    return a.metadata.slug.localeCompare(b.metadata.slug);
  });
}

async function findNoteFile(
  notesDir: string,
  slug: string,
): Promise<{ file: ReturnType<typeof Bun.file>; dir: string } | null> {
  const candidates = [
    noteDirs.get(slug),
    notesDir,
    privateDirPath(notesDir),
  ].filter(Boolean) as string[];

  for (const dir of new Set(candidates)) {
    const file = Bun.file(notePath(dir, slug));
    if (await file.exists()) return { file, dir };
  }
  return null;
}

export async function readNote(
  notesDir: string,
  slug: string,
): Promise<{ source: string; metadata: NoteMetadata | null }> {
  const found = await findNoteFile(notesDir, slug);
  if (!found) throw new NoteNotFoundError(slug);

  const source = await found.file.text();
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

  const metadata = result.note.metadata;
  const targetDir = metadata.public ? notesDir : privateDirPath(notesDir);
  const currentDir = noteDirs.get(slug);

  await Bun.write(notePath(targetDir, slug), source);

  if (currentDir && currentDir !== targetDir) {
    const oldFile = Bun.file(notePath(currentDir, slug));
    if (await oldFile.exists()) {
      await oldFile.delete();
    }
  }

  index.set(slug, { metadata, source });
  noteDirs.set(slug, targetDir);

  return metadata;
}

export async function deleteNote(
  notesDir: string,
  slug: string,
): Promise<void> {
  const found = await findNoteFile(notesDir, slug);
  if (!found) throw new NoteNotFoundError(slug);

  await found.file.delete();
  index.delete(slug);
  noteDirs.delete(slug);
}

// --- In-memory index singleton ---

let index: Map<string, NoteEntry> = new Map();
const noteDirs: Map<string, string> = new Map();
let watcher: FSWatcher | null = null;
let privateWatcher: FSWatcher | null = null;

export async function initIndex(notesDir: string): Promise<void> {
  const privDir = privateDirPath(notesDir);
  await Bun.$`mkdir -p ${privDir}`.quiet();
  index = await buildIndex(notesDir);
  console.log(`Index initialized: ${index.size} notes`);
}

export function getIndex(): NoteEntry[] {
  return sortedIndex(index);
}

export function hasNote(slug: string): boolean {
  return index.has(slug);
}

function createDirWatcher(dir: string): FSWatcher {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return watch(dir, (_event, filename) => {
    if (!filename?.endsWith(".edn")) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const slug = filename.replace(/\.edn$/, "");
      const filePath = path.join(dir, filename);

      try {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          const source = await file.text();
          const metadata = extractMetadata(source);
          if (metadata) {
            index.set(slug, { metadata, source });
            noteDirs.set(slug, dir);
          }
        } else {
          index.delete(slug);
          noteDirs.delete(slug);
        }
      } catch {
        index.delete(slug);
        noteDirs.delete(slug);
      }
    }, 100);
  });
}

export function startWatcher(notesDir: string): void {
  stopWatcher();
  watcher = createDirWatcher(notesDir);
  const privDir = privateDirPath(notesDir);
  try {
    privateWatcher = createDirWatcher(privDir);
  } catch {
    // private dir may not exist
  }
}

export function stopWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (privateWatcher) {
    privateWatcher.close();
    privateWatcher = null;
  }
}
