import { styleTags, tags as t } from "@lezer/highlight";

export const notesHighlighting = styleTags({
  Symbol: t.variableName,
  QuotedSymbol: t.labelName,
  Keyword: t.atom,
  String: t.string,
  StringContent: t.string,
  Number: t.number,
  Boolean: t.bool,
  Nil: t.null,
  LineComment: t.lineComment,
  "( )": t.paren,
  "[ ]": t.squareBracket,
  "{ }": t.brace,
});
