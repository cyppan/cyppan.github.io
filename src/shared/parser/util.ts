import type { SyntaxNode } from "@lezer/common";

export function nodeText(source: string, node: SyntaxNode): string {
  return source.slice(node.from, node.to);
}

/** Strip surrounding quotes and unescape basic escape sequences */
export function unescapeString(raw: string): string {
  const inner = raw.slice(1, -1);
  return inner.replace(/\\(.)/g, (_, ch) => {
    switch (ch) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "\\":
        return "\\";
      case '"':
        return '"';
      default:
        return ch ?? "";
    }
  });
}

/** Strip the common leading indentation from a multiline string.
 *  Preserves the first line as-is, strips min-indent from continuation lines. */
export function dedentString(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= 1) return text;

  // Measure min indent of non-empty continuation lines
  let minIndent = Infinity;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.trim().length === 0) continue;
    let spaces = 0;
    while (spaces < line.length && line[spaces] === " ") spaces++;
    minIndent = Math.min(minIndent, spaces);
  }

  if (minIndent === 0 || minIndent === Infinity) return text;

  return [
    lines[0],
    ...lines.slice(1).map((l) => (l as string).slice(minIndent)),
  ].join("\n");
}
