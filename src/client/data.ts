import type { NoteMetadata } from "../shared/parser/parse.js";

export interface NoteData {
  source: string;
  metadata: NoteMetadata;
}

export async function fetchNote(slug: string): Promise<NoteData> {
  const el = document.getElementById("note-data");
  if (el) return JSON.parse(el.textContent ?? "");

  const res = await fetch(`/api/notes/${slug}`);
  if (!res.ok)
    throw new Error(res.status === 404 ? "not-found" : `${res.status}`);
  return res.json();
}

export async function fetchIndex(): Promise<NoteData[]> {
  const el = document.getElementById("index-data");
  if (el) return JSON.parse(el.textContent ?? "");

  const res = await fetch("/api/notes");
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function createNote(
  title: string,
  isPublic: boolean,
): Promise<string> {
  const res = await fetch("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, public: isPublic }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status}`);
  }
  const { slug } = await res.json();
  return slug;
}
