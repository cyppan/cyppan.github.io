import { EditorView, WidgetType } from "@codemirror/view";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class TocLinkWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly pos: number,
  ) {
    super();
  }

  override eq(other: TocLinkWidget): boolean {
    return this.id === other.id && this.pos === other.pos;
  }

  toDOM(): HTMLElement {
    const link = document.createElement("a");
    link.className = "cm-toc-link";
    link.href = `#${this.id}`;
    link.textContent = "↗";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const cmEditor = link.closest(".cm-editor");
      if (cmEditor instanceof HTMLElement) {
        const view = EditorView.findFromDOM(cmEditor);
        if (view) {
          view.dispatch({
            effects: EditorView.scrollIntoView(this.pos, { y: "start" }),
          });
        }
      }
    });
    return link;
  }

  override ignoreEvent(e: Event): boolean {
    return e.type === "mousedown";
  }
}
