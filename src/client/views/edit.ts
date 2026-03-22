import { createEditor } from "../editor/setup.js";

export async function mountEditView(
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

  const status = document.createElement("div");
  status.className = "save-status";
  status.textContent = "";
  target.appendChild(status);

  const container = document.createElement("div");
  container.className = "editor-container";
  target.appendChild(container);

  createEditor({
    target: container,
    source,
    onSave: async (content) => {
      status.textContent = "Saving...";
      status.classList.remove("error");

      try {
        const putRes = await fetch(`/api/notes/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: content,
        });

        if (putRes.ok) {
          status.textContent = "Saved";
          setTimeout(() => {
            if (status.textContent === "Saved") {
              status.textContent = "";
            }
          }, 2000);
        } else {
          const err = (await putRes.json()) as {
            error: string;
            details?: Array<{ message: string }>;
          };
          status.classList.add("error");
          const details = err.details?.map((d) => d.message).join("; ") ?? "";
          status.textContent = `Error: ${err.error}${details ? ` — ${details}` : ""}`;
        }
      } catch (e) {
        status.classList.add("error");
        status.textContent = `Save failed: ${e instanceof Error ? e.message : "unknown error"}`;
      }
    },
  });
}
