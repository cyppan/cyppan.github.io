import { cpSync, mkdirSync } from "node:fs";
import { Glob } from "bun";
import { type NoteMetadata, parseNote } from "../src/shared/parser/parse.js";

const DIST = "dist/client";
const NOTES_DIR = "notes";
const MEDIA_DIR = "media";

/** Escape JSON string for safe embedding inside <script> tags */
function safeJson(data: unknown): string {
  return JSON.stringify(data).replace(/<\//g, "<\\/");
}

async function main() {
  // 1. Read the Vite-built index.html as template
  const indexHtml = await Bun.file(`${DIST}/index.html`).text();

  // 2. Scan and parse all notes
  const glob = new Glob("*.edn");
  const notes: Array<{ source: string; metadata: NoteMetadata }> = [];

  for await (const file of glob.scan(NOTES_DIR)) {
    const source = await Bun.file(`${NOTES_DIR}/${file}`).text();
    const result = parseNote(source);
    if (!result.ok) {
      console.warn(`Skipping ${file}: parse error`);
      continue;
    }
    notes.push({ source, metadata: result.note.metadata });
  }

  // 3. Sort notes (all notes in NOTES_DIR are public by folder convention)
  const publicIndex = notes.sort((a, b) =>
    b.metadata.created.localeCompare(a.metadata.created),
  );

  console.log(`Found ${notes.length} public notes`);

  // 4. Generate per-note HTML pages
  for (const note of publicIndex) {
    const { slug } = note.metadata;
    const title = note.metadata.title;
    const description = note.metadata.preview ?? "";

    const noteData = safeJson({
      source: note.source,
      metadata: note.metadata,
    });

    const esc = (s: string) => s.replace(/"/g, "&quot;");
    const metaTags = [
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      `<meta property="og:type" content="article">`,
      note.metadata.previewImage
        ? `<meta property="og:image" content="${esc(note.metadata.previewImage)}">`
        : null,
      `<meta name="twitter:card" content="${note.metadata.previewImage ? "summary_large_image" : "summary"}">`,
    ]
      .filter(Boolean)
      .join("\n    ");

    const html = indexHtml
      .replace(
        "<title>@cyppan Notes</title>",
        `<title>${title.replace(/</g, "&lt;")} — @cyppan Notes</title>\n    ${metaTags}`,
      )
      .replace(
        '<div id="app"></div>',
        `<div id="app"></div>\n    <script id="note-data" type="application/json">${noteData}</script>`,
      );

    const dir = `${DIST}/n/${slug}`;
    mkdirSync(dir, { recursive: true });
    await Bun.write(`${dir}/index.html`, html);
    console.log(`  → n/${slug}/index.html`);
  }

  // 5. Rewrite index.html with embedded index data
  const indexData = safeJson(publicIndex);
  const newIndex = indexHtml.replace(
    '<div id="app"></div>',
    `<div id="app"></div>\n    <script id="index-data" type="application/json">${indexData}</script>`,
  );
  await Bun.write(`${DIST}/index.html`, newIndex);
  console.log("  → index.html (with index data)");

  // 6. Copy media directory
  try {
    cpSync(MEDIA_DIR, `${DIST}/media`, { recursive: true });
    console.log("  → media/");
  } catch {
    console.log("  → no media/ directory to copy");
  }

  // 7. Generate 404.html
  const notFoundHtml = indexHtml.replace(
    "<title>@cyppan Notes</title>",
    "<title>Not Found — @cyppan Notes</title>",
  );
  await Bun.write(`${DIST}/404.html`, notFoundHtml);
  console.log("  → 404.html");

  console.log("Static build complete.");
}

main();
