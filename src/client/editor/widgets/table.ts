import { type EditorView, WidgetType } from "@codemirror/view";

function parseCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdownTable(
  rawText: string,
  indent: string,
): { headers: string[]; rows: string[][] } {
  const lines = rawText
    .split("\n")
    .map((l) =>
      l.startsWith(indent) ? l.slice(indent.length) : l.trimStart(),
    );
  const headerLine = lines[0] ?? "";
  // lines[1] is delimiter, skip
  const headers = parseCells(headerLine);
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const l = lines[i];
    if (l && l.trim().length > 0) rows.push(parseCells(l));
  }
  return { headers, rows };
}

function reconstructMarkdown(
  headers: string[],
  rows: string[][],
  indent: string,
): string {
  const colCount = headers.length;
  const delimRow = `${indent}|${headers.map(() => "---|").join("")}`;
  const headerRow = `${indent}| ${headers.join(" | ")} |`;
  const dataRows = rows.map(
    (row) =>
      `${indent}| ${Array.from({ length: colCount }, (_, i) => row[i] ?? "").join(" | ")} |`,
  );
  return [headerRow, delimRow, ...dataRows].join("\n");
}

function readCells(table: HTMLTableElement): {
  headers: string[];
  rows: string[][];
} {
  const headers: string[] = [];
  const rows: string[][] = [];
  const thead = table.tHead;
  if (thead) {
    const headerRow = thead.rows[0];
    if (headerRow) {
      for (const th of headerRow.cells) {
        const ta = th.querySelector("textarea");
        headers.push(ta ? ta.value : (th.textContent ?? ""));
      }
    }
  }
  for (const tr of table.tBodies[0]?.rows ?? []) {
    const row: string[] = [];
    for (const td of tr.cells) {
      const ta = td.querySelector("textarea");
      row.push(ta ? ta.value : (td.textContent ?? ""));
    }
    rows.push(row);
  }
  return { headers, rows };
}

function getAllTextareas(wrapper: HTMLElement): HTMLTextAreaElement[] {
  return Array.from(wrapper.querySelectorAll("textarea"));
}

function autosize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight}px`;
}

export class TableWidget extends WidgetType {
  constructor(
    readonly headers: string[],
    readonly rows: string[][],
    readonly rawFrom: number,
    readonly rawTo: number,
    readonly indent: string,
    readonly isReadonly: boolean,
  ) {
    super();
  }

  override eq(other: TableWidget): boolean {
    return (
      this.rawFrom === other.rawFrom &&
      this.rawTo === other.rawTo &&
      JSON.stringify(this.headers) === JSON.stringify(other.headers) &&
      JSON.stringify(this.rows) === JSON.stringify(other.rows)
    );
  }

  private makeCell(
    tag: "th" | "td",
    text: string,
    colIdx: number,
    rowIdx: number,
    totalCols: number,
    _totalRows: number,
    view: EditorView,
    wrapper: HTMLElement,
  ): HTMLTableCellElement {
    const cell = document.createElement(tag);
    if (this.isReadonly) {
      cell.textContent = text;
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.rows = 1;
      ta.setAttribute("data-row", String(rowIdx));
      ta.setAttribute("data-col", String(colIdx));

      ta.addEventListener("input", () => autosize(ta));

      ta.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          const areas = getAllTextareas(wrapper);
          const idx = areas.indexOf(ta);
          if (e.shiftKey) {
            areas[idx - 1]?.focus();
          } else if (idx === areas.length - 1) {
            this.addRow(view, wrapper);
          } else {
            areas[idx + 1]?.focus();
          }
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const areas = getAllTextareas(wrapper);
          const idx = areas.indexOf(ta);
          const next = areas[idx + totalCols];
          if (next) {
            next.focus();
          } else {
            this.addRow(view, wrapper);
          }
        }
      });

      cell.appendChild(ta);

      // Delete column button on header cells
      if (tag === "th" && totalCols > 1) {
        const delCol = document.createElement("button");
        delCol.className = "cm-table-del-col";
        delCol.textContent = "×";
        delCol.title = "Remove column";
        delCol.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.removeColumn(colIdx, view, wrapper);
        });
        cell.appendChild(delCol);
      }
    }
    return cell;
  }

  private commit(view: EditorView, wrapper: HTMLElement) {
    const table = wrapper.querySelector("table");
    if (!table) return;
    const { headers, rows } = readCells(table);
    const newText = reconstructMarkdown(headers, rows, this.indent);
    if (newText === reconstructMarkdown(this.headers, this.rows, this.indent))
      return;
    view.dispatch({
      changes: { from: this.rawFrom, to: this.rawTo, insert: newText },
      userEvent: "input.table",
    });
  }

  private addRow(view: EditorView, wrapper: HTMLElement) {
    const table = wrapper.querySelector("table");
    if (!table) return;
    const { headers, rows } = readCells(table);
    const newRows = [...rows, Array.from({ length: headers.length }, () => "")];
    const newText = reconstructMarkdown(headers, newRows, this.indent);
    view.dispatch({
      changes: { from: this.rawFrom, to: this.rawTo, insert: newText },
      userEvent: "input.table",
    });
  }

  private removeRow(rowIdx: number, view: EditorView, wrapper: HTMLElement) {
    const table = wrapper.querySelector("table");
    if (!table) return;
    const { headers, rows } = readCells(table);
    const newRows = rows.filter((_, i) => i !== rowIdx);
    const newText = reconstructMarkdown(headers, newRows, this.indent);
    view.dispatch({
      changes: { from: this.rawFrom, to: this.rawTo, insert: newText },
      userEvent: "input.table",
    });
  }

  private removeColumn(colIdx: number, view: EditorView, wrapper: HTMLElement) {
    const table = wrapper.querySelector("table");
    if (!table) return;
    const { headers, rows } = readCells(table);
    const newHeaders = headers.filter((_, i) => i !== colIdx);
    const newRows = rows.map((r) => r.filter((_, i) => i !== colIdx));
    const newText = reconstructMarkdown(newHeaders, newRows, this.indent);
    view.dispatch({
      changes: { from: this.rawFrom, to: this.rawTo, insert: newText },
      userEvent: "input.table",
    });
  }

  private addColumn(view: EditorView, wrapper: HTMLElement) {
    const table = wrapper.querySelector("table");
    if (!table) return;
    const { headers, rows } = readCells(table);
    const newHeaders = [...headers, ""];
    const newRows = rows.map((r) => [...r, ""]);
    const newText = reconstructMarkdown(newHeaders, newRows, this.indent);
    view.dispatch({
      changes: { from: this.rawFrom, to: this.rawTo, insert: newText },
      userEvent: "input.table",
    });
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-widget";
    // Align with surrounding string content: 8px (.cm-line padding) + indent chars × monospace char width
    wrapper.style.paddingLeft = `${8 + this.indent.length * view.defaultCharacterWidth}px`;
    const table = document.createElement("table");
    const colCount = this.headers.length;

    // Header
    const thead = table.createTHead();
    const headerTr = thead.insertRow();
    this.headers.forEach((h, ci) => {
      headerTr.appendChild(
        this.makeCell(
          "th",
          h,
          ci,
          -1,
          colCount,
          this.rows.length,
          view,
          wrapper,
        ),
      );
    });

    // Body
    const tbody = table.createTBody();
    this.rows.forEach((row, ri) => {
      const tr = tbody.insertRow();

      row.slice(0, colCount).forEach((cell, ci) => {
        tr.appendChild(
          this.makeCell(
            "td",
            cell,
            ci,
            ri,
            colCount,
            this.rows.length,
            view,
            wrapper,
          ),
        );
      });
      // Pad missing cells
      for (let ci = row.length; ci < colCount; ci++) {
        tr.appendChild(
          this.makeCell(
            "td",
            "",
            ci,
            ri,
            colCount,
            this.rows.length,
            view,
            wrapper,
          ),
        );
      }

      // Row delete button
      if (!this.isReadonly) {
        const delTd = document.createElement("td");
        delTd.className = "cm-table-row-actions";
        const delBtn = document.createElement("button");
        delBtn.className = "cm-table-del-row";
        delBtn.textContent = "×";
        delBtn.title = "Remove row";
        delBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          this.removeRow(ri, view, wrapper);
        });
        delTd.appendChild(delBtn);
        tr.appendChild(delTd);
      }
    });

    wrapper.appendChild(table);

    // Controls
    if (!this.isReadonly) {
      const controls = document.createElement("div");
      controls.className = "cm-table-controls";

      const addRowBtn = document.createElement("button");
      addRowBtn.textContent = "+ Row";
      addRowBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.addRow(view, wrapper);
      });

      const addColBtn = document.createElement("button");
      addColBtn.textContent = "+ Col";
      addColBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.addColumn(view, wrapper);
      });

      controls.appendChild(addRowBtn);
      controls.appendChild(addColBtn);
      wrapper.appendChild(controls);
    }

    // Commit on focus leaving the widget
    wrapper.addEventListener("focusout", (e) => {
      if (!wrapper.contains(e.relatedTarget as Node)) {
        this.commit(view, wrapper);
      }
    });

    // Auto-size all textareas once mounted
    requestAnimationFrame(() => {
      for (const ta of getAllTextareas(wrapper)) autosize(ta);
    });

    return wrapper;
  }

  override updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    const table = dom.querySelector("table");
    if (!table) return false;

    const { headers: curHeaders, rows: curRows } = readCells(table);
    const newHeaders = this.headers;
    const newRows = this.rows;

    // If structure changed (col/row count), force full redraw
    if (
      curHeaders.length !== newHeaders.length ||
      curRows.length !== newRows.length
    ) {
      return false;
    }

    // Update header textareas
    const headerAreas = Array.from(table.tHead?.rows[0]?.cells ?? [])
      .map((th) => th.querySelector("textarea"))
      .filter((ta): ta is HTMLTextAreaElement => ta !== null);

    headerAreas.forEach((ta, i) => {
      if (ta.value !== (newHeaders[i] ?? "") && document.activeElement !== ta) {
        ta.value = newHeaders[i] ?? "";
        autosize(ta);
      }
    });

    // Update body textareas
    Array.from(table.tBodies[0]?.rows ?? []).forEach((tr, ri) => {
      Array.from(tr.cells)
        .filter((td) => !td.classList.contains("cm-table-row-actions"))
        .forEach((td, ci) => {
          const ta = td.querySelector("textarea");
          const newVal = newRows[ri]?.[ci] ?? "";
          if (ta && ta.value !== newVal && document.activeElement !== ta) {
            ta.value = newVal;
            autosize(ta);
          }
        });
    });

    return true;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}
