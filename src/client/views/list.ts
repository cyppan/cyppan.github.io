import type { NoteData } from "../data.js";
import { createNote, fetchIndex } from "../data.js";
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
  if (import.meta.env.DEV) {
    for (const isPublic of [true, false]) {
      const btn = document.createElement("button");
      btn.className = "new-note-btn";
      btn.textContent = isPublic ? "+ Public" : "+ Private";
      btn.addEventListener("click", async () => {
        const title = prompt("Note title:");
        if (!title) return;
        try {
          const slug = await createNote(title, isPublic);
          window.location.pathname = `/edit/${slug}`;
        } catch (err) {
          alert(`Failed to create note: ${err}`);
        }
      });
      header.appendChild(btn);
    }
  }
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

    const header = document.createElement("div");
    header.className = "note-header";

    const a = document.createElement("a");
    a.href = import.meta.env.DEV
      ? `/edit/${note.metadata.slug}`
      : `/n/${note.metadata.slug}`;
    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.metadata.title;
    a.appendChild(title);
    header.appendChild(a);

    const meta = document.createElement("div");
    meta.className = "note-meta";
    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = note.metadata.created;
    meta.appendChild(date);
    const aiLevel = document.createElement("a");
    aiLevel.className = "ai-level";
    aiLevel.textContent = `ai-level-${note.metadata.aiContribution}`;
    aiLevel.href =
      "https://www.visidata.org/blog/2026/ai/#self-assessed-ai-level-for-contributions";
    aiLevel.target = "_blank";
    aiLevel.rel = "noopener";
    meta.appendChild(aiLevel);
    header.appendChild(meta);

    li.appendChild(header);

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
