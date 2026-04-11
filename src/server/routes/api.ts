import path from "node:path";
import { Hono } from "hono";
import {
  deleteNote,
  getIndex,
  hasNote,
  isNotePublic,
  isValidSlug,
  NoteNotFoundError,
  NoteParseError,
  readNote,
  slugify,
  writeNote,
} from "../notes.ts";

const api = new Hono();

const notesDir = path.resolve(process.cwd(), "notes");

api.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// --- Read routes (always available) ---

api.get("/notes", (c) => {
  return c.json(getIndex());
});

api.get("/notes/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!isValidSlug(slug)) {
    return c.json({ error: "Invalid slug format" }, 400);
  }

  try {
    const note = await readNote(notesDir, slug);
    return c.json(note);
  } catch (err) {
    if (err instanceof NoteNotFoundError) {
      return c.json({ error: "Note not found" }, 404);
    }
    return c.json({ error: "Internal server error" }, 500);
  }
});

// --- Write routes (dev only) ---

const isProd = process.env.NODE_ENV === "production";

if (!isProd) {
  api.post("/notes", async (c) => {
    let body: { slug?: string; title?: string; public?: boolean };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    let slug: string;
    const title = body.title ?? "";
    const isPublic = body.public ?? false;

    if (body.slug) {
      slug = body.slug;
    } else if (body.title) {
      slug = slugify(body.title);
    } else {
      return c.json({ error: "Provide slug or title" }, 400);
    }

    if (!isValidSlug(slug)) {
      return c.json({ error: "Invalid slug format" }, 400);
    }

    if (hasNote(slug)) {
      return c.json({ error: "Note already exists" }, 409);
    }

    const today = new Date().toISOString().slice(0, 10);
    const heading = title || slug;
    const source = `(defnote "${heading}"
  {:slug '${slug}
   :tags []
   :ai-contribution :level-0
   :created "${today}"}

  "# ${heading}")
`;

    try {
      const metadata = await writeNote(notesDir, slug, source, isPublic);
      return c.json({ slug, metadata }, 201);
    } catch (err) {
      if (err instanceof NoteParseError) {
        return c.json(
          { error: "Invalid note source", details: err.errors },
          400,
        );
      }
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  api.put("/notes/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!isValidSlug(slug)) {
      return c.json({ error: "Invalid slug format" }, 400);
    }

    if (!hasNote(slug)) {
      return c.json({ error: "Note not found" }, 404);
    }

    const source = await c.req.text();
    if (!source.trim()) {
      return c.json({ error: "Empty source" }, 400);
    }

    try {
      const metadata = await writeNote(
        notesDir,
        slug,
        source,
        isNotePublic(slug),
      );
      return c.json({ metadata });
    } catch (err) {
      if (err instanceof NoteParseError) {
        return c.json(
          { error: "Invalid note source", details: err.errors },
          400,
        );
      }
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  api.delete("/notes/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!isValidSlug(slug)) {
      return c.json({ error: "Invalid slug format" }, 400);
    }

    try {
      await deleteNote(notesDir, slug);
      return c.json({ deleted: slug });
    } catch (err) {
      if (err instanceof NoteNotFoundError) {
        return c.json({ error: "Note not found" }, 404);
      }
      return c.json({ error: "Internal server error" }, 500);
    }
  });
}

export default api;
