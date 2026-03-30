import { fetchNote } from "../data.js";
import { createEditor } from "../editor/setup.js";

export async function mountReadView(
  target: HTMLElement,
  slug: string,
): Promise<void> {
  let source: string;
  try {
    const note = await fetchNote(slug);
    source = note.source;
  } catch (e) {
    const msg =
      e instanceof Error && e.message === "not-found"
        ? `Note <strong>${slug}</strong> not found.`
        : `Error loading note.`;
    target.innerHTML = `<p>${msg}</p>`;
    return;
  }

  const nav = document.createElement("a");
  nav.className = "nav-back";
  nav.href = "/";
  nav.textContent = "← notes";
  target.appendChild(nav);

  const container = document.createElement("div");
  container.className = "editor-container";
  target.appendChild(container);

  createEditor({
    target: container,
    source,
    readonly: true,
  });
}
