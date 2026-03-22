import { createEditor } from "../editor/setup.js";

export async function mountReadView(
  target: HTMLElement,
  slug: string,
): Promise<void> {
  const res = await fetch(`/api/notes/${slug}`);
  if (!res.ok) {
    target.innerHTML =
      res.status === 404
        ? `<p>Note <strong>${slug}</strong> not found.</p>`
        : `<p>Error loading note: ${res.status}</p>`;
    return;
  }

  const { source } = (await res.json()) as { source: string };

  const container = document.createElement("div");
  container.className = "editor-container";
  target.appendChild(container);

  createEditor({
    target: container,
    source,
    readonly: true,
  });
}
