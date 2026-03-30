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
