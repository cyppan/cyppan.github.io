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
import { blockquoteDecoration } from "./blockquote.js";
import { dslWidgets } from "./decorations.js";
import { ednFoldGutter, foldKeymap } from "./fold.js";
import { notesLang } from "./language.js";
import { proseDecoration } from "./prose.js";
import { notesHighlightExt, notesTheme, readTheme } from "./theme.js";

export function createEditor(options: {
  target: HTMLElement;
  source: string;
  readonly?: boolean;
  onSave?: (source: string) => void;
}): EditorView {
  const { target, source, readonly = false, onSave } = options;

  const extensions = [
    notesLang(),
    notesHighlightExt,
    notesTheme,
    blockquoteDecoration(),
    proseDecoration(),
    dslWidgets(),
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
    highlightWhitespace(),
  ];

  if (readonly) {
    extensions.push(
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      readTheme,
    );
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

  return new EditorView({
    state: EditorState.create({
      doc: source,
      extensions,
    }),
    parent: target,
  });
}
