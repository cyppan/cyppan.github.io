import { WidgetType } from "@codemirror/view";

export class MediaWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  override eq(other: MediaWidget): boolean {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-media-widget";

    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    if (this.alt) img.title = this.alt;

    img.onerror = () => {
      wrapper.textContent = `[Image not found: ${this.src}]`;
      wrapper.classList.add("cm-media-error");
    };

    wrapper.appendChild(img);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
