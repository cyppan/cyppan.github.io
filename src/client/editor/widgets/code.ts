import { WidgetType } from "@codemirror/view";
import { dedentString } from "../../../shared/parser/util.js";

export class CodeWidget extends WidgetType {
  private readonly displayCode: string;

  constructor(
    readonly lang: string,
    readonly rawCode: string,
  ) {
    super();
    this.displayCode = dedentString(rawCode);
  }

  override eq(other: CodeWidget): boolean {
    return this.lang === other.lang && this.rawCode === other.rawCode;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-code-widget";

    if (this.lang) {
      const langLabel = document.createElement("span");
      langLabel.className = "cm-code-lang";
      langLabel.textContent = this.lang;
      wrapper.appendChild(langLabel);
    }

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = this.displayCode;
    pre.appendChild(code);
    wrapper.appendChild(pre);

    return wrapper;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
