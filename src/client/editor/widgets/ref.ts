import { WidgetType } from "@codemirror/view";

export class RefWidget extends WidgetType {
  constructor(
    readonly slug: string,
    readonly label: string,
  ) {
    super();
  }

  override eq(other: RefWidget): boolean {
    return this.slug === other.slug && this.label === other.label;
  }

  toDOM(): HTMLElement {
    const link = document.createElement("a");
    link.className = "cm-ref-widget";
    link.href = `/n/${this.slug}`;
    link.textContent = this.label || this.slug;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = link.href;
    });
    return link;
  }

  override ignoreEvent(e: Event): boolean {
    return e.type === "mousedown";
  }
}
