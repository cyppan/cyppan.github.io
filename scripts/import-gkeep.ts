import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Glob } from "bun";

const ROOT = `${import.meta.dir}/..`;
const GKEEP_DIR = join(ROOT, "gkeep");
const EXPORTS_DIR = join(GKEEP_DIR, "exports");
const ASSETS_DIR = join(GKEEP_DIR, "assets");

interface KeepNote {
  color: string;
  isTrashed: boolean;
  isPinned: boolean;
  isArchived: boolean;
  textContent?: string;
  title: string;
  userEditedTimestampUsec: number;
  createdTimestampUsec: number;
  labels?: Array<{ name: string }>;
  listContent?: Array<{ text: string; isChecked: boolean }>;
  attachments?: Array<{ filePath: string; mimetype: string }>;
  annotations?: Array<{
    description?: string;
    source?: string;
    title?: string;
    url?: string;
  }>;
}

function usecToDate(usec: number): string {
  return new Date(usec / 1000).toISOString().split("T")[0];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function dedupeSlug(slug: string, used: Set<string>): string {
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let i = 2;
  while (used.has(`${slug}-${i}`)) i++;
  const result = `${slug}-${i}`;
  used.add(result);
  return result;
}

function escapeYaml(s: string): string {
  if (/[:"'#[\]{}&*!|>%@`]/.test(s) || s.includes("\n")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

function noteToMarkdown(note: KeepNote): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`title: ${escapeYaml(note.title || "Untitled")}`);
  lines.push(`created: ${usecToDate(note.createdTimestampUsec)}`);
  lines.push(`modified: ${usecToDate(note.userEditedTimestampUsec)}`);
  if (note.isPinned) lines.push("pinned: true");
  if (note.isArchived) lines.push("archived: true");
  if (note.color !== "DEFAULT") lines.push(`color: ${note.color}`);
  if (note.labels?.length) {
    lines.push(
      `labels: [${note.labels.map((l) => escapeYaml(l.name)).join(", ")}]`,
    );
  }
  lines.push("---");
  lines.push("");

  // Text content
  if (note.textContent?.trim()) {
    lines.push(note.textContent.trim());
    lines.push("");
  }

  // List content (checklist)
  if (note.listContent?.length) {
    for (const item of note.listContent) {
      const check = item.isChecked ? "x" : " ";
      lines.push(`- [${check}] ${item.text}`);
    }
    lines.push("");
  }

  // Annotations (links)
  if (note.annotations?.length) {
    for (const ann of note.annotations) {
      if (ann.url) {
        const label = ann.title || ann.description || ann.url;
        const desc =
          ann.description && ann.description !== ann.title
            ? ` — ${ann.description}`
            : "";
        lines.push(`> [${label}](${ann.url})${desc}`);
      }
    }
    lines.push("");
  }

  // Attachments
  if (note.attachments?.length) {
    for (const att of note.attachments) {
      lines.push(`![${att.mimetype}](assets/${att.filePath})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function findLatestZip(): Promise<string> {
  const glob = new Glob("*.zip");
  const zips: string[] = [];
  for await (const f of glob.scan(EXPORTS_DIR)) {
    zips.push(f);
  }
  if (zips.length === 0) {
    throw new Error(`No .zip files found in ${EXPORTS_DIR}`);
  }
  zips.sort();
  return join(EXPORTS_DIR, zips[zips.length - 1]);
}

async function main() {
  // 1. Resolve zip path
  const zipPath = process.argv[2] || (await findLatestZip());
  if (!existsSync(zipPath)) {
    throw new Error(`Zip not found: ${zipPath}`);
  }
  console.log(`Importing from: ${basename(zipPath)}`);

  // 2. Extract to temp dir
  const tmp = join(tmpdir(), `gkeep-import-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  await Bun.$`ditto -x -k ${zipPath} ${tmp}`.quiet();

  const keepDir = join(tmp, "Takeout", "Keep");
  if (!existsSync(keepDir)) {
    rmSync(tmp, { recursive: true });
    throw new Error("No Takeout/Keep/ directory found in zip");
  }

  // 3. Clean output directories
  const mdGlob = new Glob("*.md");
  for await (const f of mdGlob.scan(GKEEP_DIR)) {
    rmSync(join(GKEEP_DIR, f));
  }
  if (existsSync(ASSETS_DIR)) {
    rmSync(ASSETS_DIR, { recursive: true });
  }
  mkdirSync(ASSETS_DIR, { recursive: true });

  // 4. Parse and convert notes
  const jsonGlob = new Glob("*.json");
  const usedSlugs = new Set<string>();
  let imported = 0;
  let skipped = 0;
  let assetCount = 0;

  const notes: Array<{ note: KeepNote; file: string }> = [];
  for await (const file of jsonGlob.scan(keepDir)) {
    const raw = await Bun.file(join(keepDir, file)).text();
    try {
      const note: KeepNote = JSON.parse(raw);
      notes.push({ note, file });
    } catch {
      console.warn(`  Skipping malformed JSON: ${file}`);
    }
  }

  // Sort by modified date descending
  notes.sort(
    (a, b) => b.note.userEditedTimestampUsec - a.note.userEditedTimestampUsec,
  );

  for (const { note, file } of notes) {
    if (note.isTrashed) {
      skipped++;
      continue;
    }

    // Generate slug
    const titleForSlug =
      note.title || note.textContent?.slice(0, 50) || `untitled`;
    const slug = dedupeSlug(slugify(titleForSlug), usedSlugs);

    // Write markdown
    const md = noteToMarkdown(note);
    await Bun.write(join(GKEEP_DIR, `${slug}.md`), md);

    // Copy attachments
    if (note.attachments?.length) {
      for (const att of note.attachments) {
        const src = join(keepDir, att.filePath);
        if (existsSync(src)) {
          const dest = join(ASSETS_DIR, att.filePath);
          await Bun.write(dest, Bun.file(src));
          assetCount++;
        }
      }
    }

    imported++;
  }

  // 5. Cleanup temp
  rmSync(tmp, { recursive: true });

  // 6. Summary
  console.log(
    `Done: ${imported} notes imported, ${skipped} trashed skipped, ${assetCount} assets copied`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
