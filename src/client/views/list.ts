import type { NoteData } from "../data.js";
import { fetchIndex } from "../data.js";
import { createPreviewEditor } from "../editor/preview.js";

function getActiveTag(): string | null {
  return new URLSearchParams(window.location.search).get("tag");
}

function collectTags(notes: NoteData[]): string[] {
  const set = new Set<string>();
  for (const n of notes) {
    for (const t of n.metadata.tags) set.add(t);
  }
  return [...set].sort();
}

function renderList(target: HTMLElement, notes: NoteData[]): void {
  target.innerHTML = "";

  const activeTag = getActiveTag();
  const allTags = collectTags(notes);
  const filtered = activeTag
    ? notes.filter((n) => n.metadata.tags.includes(activeTag))
    : notes;

  // Header
  const header = document.createElement("header");
  header.className = "site-header";
  const h1 = document.createElement("h1");
  h1.textContent = "@cyppan notes";
  header.appendChild(h1);
  target.appendChild(header);

  // Tag filter
  if (allTags.length > 0) {
    const nav = document.createElement("nav");
    nav.className = "tag-filter";
    for (const tag of allTags) {
      const btn = document.createElement("a");
      btn.className = "tag-pill";
      if (tag === activeTag) btn.classList.add("active");
      btn.textContent = tag;
      btn.href = tag === activeTag ? "/" : `/?tag=${encodeURIComponent(tag)}`;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const url =
          tag === activeTag ? "/" : `/?tag=${encodeURIComponent(tag)}`;
        history.pushState(null, "", url);
        renderList(target, notes);
      });
      nav.appendChild(btn);
    }
    target.appendChild(nav);
  }

  // Note list
  const ul = document.createElement("ul");
  ul.className = "note-list";

  for (const note of filtered) {
    const li = document.createElement("li");
    li.className = "note-item";

    const a = document.createElement("a");
    a.href = import.meta.env.DEV
      ? `/edit/${note.metadata.slug}`
      : `/n/${note.metadata.slug}`;
    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.metadata.title;
    a.appendChild(title);
    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = note.metadata.created;
    a.appendChild(date);
    li.appendChild(a);

    if (note.metadata.previewSource) {
      const previewContainer = document.createElement("div");
      previewContainer.className = "note-preview";
      li.appendChild(previewContainer);
      createPreviewEditor(previewContainer, note.source);
    }

    if (note.metadata.tags.length > 0) {
      const tags = document.createElement("div");
      tags.className = "note-tags";
      for (const t of note.metadata.tags) {
        const pill = document.createElement("span");
        pill.className = "tag-pill";
        pill.textContent = t;
        tags.appendChild(pill);
      }
      li.appendChild(tags);
    }

    ul.appendChild(li);
  }

  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "note-item";
    li.textContent = "No notes found.";
    ul.appendChild(li);
  }

  target.appendChild(ul);
}

export async function mountListView(target: HTMLElement): Promise<void> {
  let notes: NoteData[];
  try {
    notes = await fetchIndex();
  } catch {
    target.innerHTML = "<p>Error loading notes.</p>";
    return;
  }

  renderList(target, notes);

  // Re-render on back/forward for tag filter changes
  window.addEventListener("popstate", () => renderList(target, notes));
}
