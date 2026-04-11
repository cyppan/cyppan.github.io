import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightWhitespace,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { aiLevelDecoration } from "./ai-level.js";
import { blockquoteDecoration } from "./blockquote.js";
import { dslWidgets } from "./decorations.js";
import { fencedCodeDecoration } from "./fenced-code.js";
import {
  autoFoldCode,
  autoFoldPreview,
  ednFoldGutter,
  foldKeymap,
} from "./fold.js";
import { notesLang } from "./language.js";
import { proseDecoration } from "./prose.js";
import { tableDecoration } from "./table.js";
import { notesHighlightExt, notesTheme, readTheme } from "./theme.js";
import { tocAutoGen } from "./toc.js";
import { wrapIndent } from "./wrap-indent.js";

export function createEditor(options: {
  target: HTMLElement;
  source: string;
  readonly?: boolean;
  onSave?: (source: string) => void;
  extraExtensions?: import("@codemirror/state").Extension[];
}): EditorView {
  const { target, source, readonly = false, onSave, extraExtensions } = options;

  const extensions = [
    notesLang(),
    notesHighlightExt,
    notesTheme,
    blockquoteDecoration(),
    proseDecoration(),
    dslWidgets(),
    tableDecoration(),
    fencedCodeDecoration(),
    aiLevelDecoration(),
    lineNumbers(),
    ednFoldGutter(),
    bracketMatching(),
    indentOnInput(),
    history(),
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
    ]),
    EditorView.lineWrapping,
    wrapIndent(),
    highlightWhitespace(),
  ];

  if (readonly) {
    extensions.push(
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      readTheme,
      autoFoldCode(),
    );
  }

  if (!readonly) {
    extensions.push(tocAutoGen());
  }

  if (onSave) {
    extensions.push(
      keymap.of([
        {
          key: "Mod-s",
          run: (view) => {
            onSave(view.state.doc.toString());
            return true;
          },
        },
      ]),
    );
  }

  if (extraExtensions) {
    extensions.push(...extraExtensions);
  } else {
    extensions.push(autoFoldPreview());
  }

  return new EditorView({
    state: EditorState.create({
      doc: source,
      extensions,
    }),
    parent: target,
  });
}
