Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Workflow

- Always validate approach with the user before implementing, especially for UI/design decisions. Explain the proposed approach, ask for confirmation, then code.

## Design Philosophy

- The EDN DSL is self-sufficient. The DSL text IS the interface — it must always remain visible and editable.
- **Never use `Decoration.replace` on DSL forms.** Replacing the DSL hides it from the user and makes it uneditable. This is forbidden.
- Widgets **augment** the DSL, they don't substitute it. Use `Decoration.widget` (positioned before/after the form) to render visual complements alongside the raw EDN.
  - `(media ...)`: the form stays visible and editable. An image preview is rendered below/after it as a visual aid.
  - `(ref ...)`: the form stays visible and editable. In **read-only mode**, the ref text is rendered as a clickable link. In **edit mode**, it is plain text (no link behavior).
  - `(code ...)`: the DSL wrapping form always stays visible. In **edit mode**, the string content is a plain multiline editor (markdown nested parsing disabled for code strings). In **read-only mode**, a `CodeWidget` is inserted after the form showing the code syntax-highlighted in the target language (just `<pre><code>`, no labels or wrappers).
- When adding new DSL form support: (1) the form always renders as raw EDN with syntax highlighting, (2) only add a companion widget when the rendered output adds something the text alone can't convey (e.g., an image), (3) never wrap in styled containers with labels or colored backgrounds.

## TypeScript Rules

- Never use non-null assertions (`!.`). Use optional chaining (`?.`), early returns, or `if` guards instead.

## Code Quick Checks

Use `bun run check` to check for type errors and syntax errors, it's fast you can use it heavily during development.

## Frontend

This project uses Vite for the client build (not Bun.serve HTML imports). Server is Hono on Bun.

### Dev server

`bun run dev` starts both Hono (port 3000) and Vite (port 5173). The script uses `trap 'kill 0' EXIT` to clean up child processes. Vite is configured with `usePolling: true` so file changes from external tools are reliably detected (macOS FSEvents can miss atomic writes). To restart cleanly, kill by port: `lsof -ti :5173 -ti :3000 | xargs kill -9`.

## Architecture: Nested Parsing & the "Inner Language" Problem

The editor uses a custom Lezer grammar for EDN syntax, with `parseMixed` nesting a markdown parser inside `StringContent` nodes. This creates a two-language tree: EDN wraps markdown.

**Key consequence**: inside string content, CM6 treats markdown as the active language. Any CM6 feature that walks the syntax tree (indentation, folding, autocomplete) will hit markdown's behavior inside strings, not our EDN rules. This affects:

- **Indentation**: `indentNodeProp` on the `String` node is never reached inside strings because the markdown language takes over. We use an `indentService` (top-level facet, runs before language-specific indent) to intercept indentation inside strings and return `column of " + 1`.
- **Folding**: The markdown parser has built-in `foldNodeProp` on Section/heading nodes. We use a custom fold gutter (`src/client/editor/fold.ts`) that only shows fold markers for EDN nodes (List/Vector/Map/String), ignoring markdown fold props entirely.
- **Fonts/styling**: The base editor font is **monospace** (DSL-first). String content (prose) gets serif via a `Decoration.mark` with class `.cm-prose` applied to `StringContent` ranges by a `ViewPlugin` in `src/client/editor/prose.ts`. Plain paragraph text inside strings gets NO highlight class from CM6 — it inherits serif from the `.cm-prose` mark. Markdown highlight tokens (headings, bold, etc.) need **explicit `fontFamily: serif`** in the `HighlightStyle` because CM6 flattens mark decorations with highlight spans into a single element (no CSS inheritance). `t.monospace` (backtick code) keeps explicit monospace to override the prose serif. EDN tokens inherit monospace from the base — no per-token `fontFamily` needed.
- **Enter key**: Inside strings, a simple `stringEnter` command at `Prec.highest` overrides markdown's Enter handler. It just copies the current line's leading whitespace — no markdown continuation logic (`> `, `- `, etc.).
- **Any future feature** touching the parse tree inside strings will face the same issue: the mounted markdown tree takes over. The pattern for working around it: use a top-level facet/service (like `indentService`, `foldService`) that walks up the tree to find the EDN ancestor node, bypassing the inner markdown language. For visual features (like fold gutter), replace the standard CM6 extension with a custom one that only queries EDN nodes.

### Overlay vs. non-overlay mounting (critical)

The `parseMixed` wrapper uses **overlay mounting** (via `computeDedentOverlays`) to strip the string's base indentation before the markdown parser sees it. This prevents markdown from misinterpreting indented prose as code blocks (4+ spaces = code in CommonMark).

**Critical tree traversal rule**: `tree.iterate()` does NOT enter overlay-mounted trees. `tree.resolveInner()` DOES. Any code that needs to find markdown nodes (Blockquote, Heading, etc.) inside strings must use `resolveInner`, not `iterate`. The `findEnclosingString` helper in `language.ts` uses this pattern.

For `ViewPlugin`s that need to find overlay nodes across visible ranges: iterate lines, call `resolveInner` per line, walk up parents. See `blockquote.ts` for the pattern.

`syntaxHighlighting` and `highlightTree` handle overlays internally — no special work needed for highlight-based styling.

### Indentation rules (`src/client/editor/language.ts`)

Two mechanisms work together:

1. **`indentNodeProp`** on the parser config — handles `List`, `Vector`, `Map`:
   - `List` (`()`): Lisp body indent — `align: false`, always 2 spaces from `(`. Does NOT align with content after `(`.
   - `Vector` (`[]`) and `Map` (`{}`): `delimitedIndent` default — aligns content with first item after `[` or `{`.
   - `String` (`""`): also defined here but **never reached** inside strings due to the nested markdown language.

2. **`indentService`** (top-level facet) — handles `String` indentation. Uses `findEnclosingString` to walk up the tree looking for a `String` ancestor. Returns `column of " + 1`, or `column of "` if the line starts with a closing `"` **and** not computing indent for a new line. Positions at or past the closing `"` (`node.to - 1`) return `undefined` to fall through to the normal indent chain.

**Critical CM6 gotcha**: `indentService` callbacks must return `undefined` (not `null`) to fall through. `null` is treated as "indent to column 0" and stops the chain — this silently breaks all other indentation.

**Critical CM6 gotcha**: `indentService` is called both for re-indenting existing lines AND for computing indent of new lines after Enter. In the Enter case, `context.simulatedBreak` is non-null — the `pos` parameter points at the current line (before the simulated break), not the new line. Any logic that inspects the current line's text (e.g., "does this line start with a closing delimiter?") must guard with `context.simulatedBreak == null`, otherwise it incorrectly applies the existing-line rule to the new line.

### Folding (`src/client/editor/fold.ts`)

Custom fold gutter, not the standard `foldGutter()`. Computes fold ranges directly as `node.from + 1` to `node.to - 1` for all EDN foldable types (single-character delimiters). Does NOT use `foldNodeProp` on the tree — instead uses its own `ednFoldRange` function to avoid picking up markdown's fold props.

### Dedent overlays (`computeDedentOverlays` in `language.ts`)

String continuation lines are indented to `column of " + 1`. Without compensation, the markdown parser would see this indentation and potentially treat 4+ spaces as code blocks. `computeDedentOverlays` computes `parseMixed` overlay ranges that skip the minimum common indent on continuation lines — the markdown parser sees dedented text. Position mapping between overlays and the document is handled automatically by Lezer.

### Blockquote decoration (`src/client/editor/blockquote.ts`)

`HighlightStyle` handles text styling (color, italic) for blockquotes via `t.quote`. But block-level styling (left border) requires line decorations. A `ViewPlugin` walks visible lines with `resolveInner` (not `iterate` — see overlay rule above) to find `Blockquote` ancestors and applies `Decoration.line` with a `baseTheme`.

**Critical resolve position rule**: `resolveInner` must be called at a position AFTER the leading whitespace on each line, not at `line.from + 1`. Leading whitespace on string continuation lines falls either (a) before the `Blockquote` node range in the markdown tree, or (b) in a gap between overlay ranges (the stripped indentation). Skip to `line.text.search(/\S/) + 1` before resolving. This applies to any `ViewPlugin` that uses `resolveInner` per-line to detect markdown block nodes.

**Blockquote CSS must not shift content**: The `.cm-blockquote` style must NOT use `paddingLeft` or any property that shifts line content horizontally. The leading whitespace on string continuation lines is structural EDN indentation in monospace font — any content shift misaligns it with surrounding non-blockquote lines. Use only `borderLeft` for the visual indicator.

### Prose font boundaries (`src/client/editor/prose.ts`)

The `.cm-prose` serif mark is applied per-line to `StringContent`, **excluding** the leading `baseIndent` spaces on continuation lines (`baseIndent` = column of opening `"` + 1). These leading spaces are structural EDN indentation and must remain in the base monospace font. The prose mark starts at the first non-indent character on each continuation line. Any new decoration or style applied to string content lines must respect this boundary: structural indent spaces = monospace, prose content after them = serif.

### DSL form widgets (`src/client/editor/decorations.ts`)

DSL forms are **never replaced** — the EDN text always stays visible and editable. Widgets are companion decorations placed alongside the form via `Decoration.widget` (not `Decoration.replace`). The tree is scanned with `tree.iterate()` (outer EDN nodes only — doesn't enter overlay markdown), matching `List` nodes whose first `Symbol` child is a known form name.

- `(media ...)`: a `MediaWidget` (image preview) is inserted after the form as a block widget.
- `(ref ...)`: in read-only mode, a `RefWidget` (clickable link) is inserted after the form. In edit mode, no widget — the DSL text is sufficient.
- `(code ...)`: in edit mode, the string content is a plain multiline editor (no markdown nesting). In read-only mode, a `CodeWidget` (syntax-highlighted `<pre><code>`) is inserted after the form. The DSL wrapping form stays visible in both modes.

Widget classes (`src/client/editor/widgets/`): `MediaWidget` (image preview), `RefWidget` (clickable link for read-only mode), `CodeWidget` (syntax-highlighted code for read-only mode). Each extends `WidgetType` with `toDOM()` and `eq()`.

### Fenced code block decoration (`src/client/editor/fenced-code.ts`)

In read-only mode, fenced code blocks (` ``` `) inside markdown strings are replaced with scrollable `<pre>` widgets via `Decoration.replace({ block: true })`. This uses `resolveInner` per-line (same overlay pattern as `blockquote.ts` and `table.ts`) to find `FencedCode` nodes.

**Critical fold interaction**: Any `Decoration.replace({ block: true })` that overlaps with a folded range will visually leak outside the fold — the block widget renders even though the fold should hide those lines. The fenced code field MUST check `isInsideFold(state, pos)` before creating decorations, and MUST rebuild on `foldEffect`/`unfoldEffect` (same pattern as `dslWidgetField` in `decorations.ts`). Without this, fenced code blocks inside folded forms (e.g., `(preview ...)`) render below the fold marker.

**Critical mobile layout**: Block widgets with `white-space: pre` content inflate `.cm-content`'s intrinsic min-width in the flex layout, causing the entire CM scroller to scroll horizontally. Widget wrappers need `overflow: hidden`, and `.cm-content` needs `minWidth: "0 !important"` (set in `theme.ts`) so flexbox can shrink it below its content's min-content size. Without this, individual widget scrollbars can't work because the scroller scrolls first.

### String node structure

Grammar: `String[isolate] { '"' StringContent? '"' }`. The `[isolate]` wrap enables `parseMixed` to target `StringContent` for nested markdown. The `"` quotes are anonymous tokens — they appear as child nodes but don't have names, which breaks CM6 utilities that rely on `firstChild`/`lastChild` being meaningful (like `foldInside` and `bracketedAligned`). The closing `"` is at `node.to - 1` (not `node.to`).
