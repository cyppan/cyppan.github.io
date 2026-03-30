import { WidgetType } from "@codemirror/view";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";

/** Strip exactly `amount` leading spaces from continuation lines.
 *  Unlike dedentString (which strips min indent), this preserves
 *  the code's relative indentation by only removing the EDN
 *  structural indent (column of opening " + 1). */
function dedentByAmount(text: string, amount: number): string {
  const lines = text.split("\n");
  if (lines.length <= 1 || amount <= 0) return text;
  return [
    lines[0],
    ...lines.slice(1).map((l) => {
      let stripped = 0;
      while (stripped < amount && stripped < l.length && l[stripped] === " ") {
        stripped++;
      }
      return l.slice(stripped);
    }),
  ].join("\n");
}

export class CodeWidget extends WidgetType {
  private readonly displayCode: string;

  constructor(
    readonly lang: string,
    readonly rawCode: string,
    readonly indent: number,
    readonly baseIndent: number,
  ) {
    super();
    this.displayCode = dedentByAmount(rawCode, baseIndent);
  }

  override eq(other: CodeWidget): boolean {
    return this.lang === other.lang && this.rawCode === other.rawCode;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-code-widget";
    wrapper.style.paddingLeft = `${this.indent}ch`;

    const pre = document.createElement("pre");
    const code = document.createElement("code");

    if (this.lang) {
      try {
        const result = hljs.highlight(this.displayCode, {
          language: this.lang,
        });
        code.innerHTML = result.value;
      } catch {
        // Language not supported by highlight.js, render as plain text
        code.textContent = this.displayCode;
      }
    } else {
      code.textContent = this.displayCode;
    }

    pre.appendChild(code);
    wrapper.appendChild(pre);
    return wrapper;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}
