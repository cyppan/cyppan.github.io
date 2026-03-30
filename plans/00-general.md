# Note System — General Plan

## What

A personal note-taking web app powered by a Lisp/EDN DSL, with a WYSIWYG-like editing experience built on CodeMirror 6. Notes are `.edn` files stored in the same git repo as the application code. Local editing only, production is read-only. Public notes are served via CodeMirror in readonly mode.

## Stack

- **Runtime**: Bun
- **Server**: Hono (minimal, functional-style HTTP server, with `Bun.serve`)
- **Client build**: Vite + TypeScript
- **Editor**: CodeMirror 6 with custom Lezer grammar
- **Storage**: Filesystem (`.edn` files in `notes/` directory, versioned in git)
- **No database**. The filesystem is the source of truth. Metadata is parsed from note headers and held in an in-memory index.
- **UI**: Vanilla TS — no React/Solid. CM6 is the UI; surrounding chrome is minimal.
- **Styling**: CM6 theme (JS) for editor/widgets, minimal CSS for app shell only

---

## DSL Format (.edn files)

Each note is a single `.edn` file. The top-level form is `defnote`. Children are an ordered sequence of heterogeneous blocks: strings are markdown content, forms are structural/semantic blocks.

### Example note: `notes/creating-a-note-system.edn`

```clojure
(defnote creating-a-note-system
  {:tags [:architecture :personal-tools]
   :public true
   :created "2026-03-20"}

  "# Creating an innovative note system

   Some **rich** markdown text. This is where prose lives.
   Inline `code`, [links](https://...), all standard markdown."

  (media {:src "/media/architecture-diagram.png" :alt "System diagram"})

  "## Technical choices

   More markdown here. The DSL structure provides block-level
   organization while markdown handles inline formatting."

  (ref codemirror-architecture "See also: CodeMirror deep dive")

  (code :clojure
    "(defn parse-note [raw]
       (-> raw tokenize structure))")

  (inspirations
    ["https://notes.andymatuschak.org/"
     "https://gwern.net/"]))
```

### DSL rules

- `defnote` takes a slug (symbol), an optional metadata map, and a sequence of blocks.
- **String blocks**: Rendered as markdown. Full CommonMark support.
- **`(media {:src "..." :alt "..."})`**: Image or video. Rendered inline via CM6 decoration widget. Supports local paths (`/media/...`) and remote URLs.
- **`(ref slug "optional label")`**: Cross-reference to another note. Rendered as a clickable link.
- **`(code :lang "source")`**: Fenced code block with language-specific highlighting.
- **`(inspirations [...])`**: List of reference URLs.
- **Extensible**: New block types can be added by defining a new form name and a corresponding decoration widget. Examples for later: `(aside "...")`, `(quote {:source "..."} "...")`, `(embed {:type :youtube :id "..."})`.

---

## Lezer Grammar

Custom Lezer grammar for the DSL. The grammar must handle:

- **Atoms**: symbols, keywords (`:keyword`), strings (double-quoted, multiline), numbers, booleans
- **Collections**: lists `()`, vectors `[]`, maps `{}`
- **Top-level form**: `(defnote slug metadata? block*)`
- **String nodes**: These are the markdown content blocks. They will be parsed with a nested markdown parser via CM6's mixed-language support (`parseMixedLanguage`).
- **Comments**: `;` line comments, `#_` discard

The grammar is intentionally close to EDN/Clojure syntax. It does NOT need to handle the full Clojure language — only the subset used by the note DSL.

The grammar lives in `src/shared/parser/` and is used both client-side (CM6 editor) and server-side (metadata extraction, public note rendering).

---

## CodeMirror 6 Editor

### Core setup (`src/client/editor/setup.ts`)

Create a CM6 `EditorView` with:

- The custom Lezer-based language support (syntax highlighting, bracket matching, auto-indent)
- Nested markdown parsing inside string nodes via `parseMixedLanguage`
- A decoration plugin that scans the parse tree for known DSL forms and replaces them with widgets
- Keybindings for common actions (save, insert block templates)
- A theme that provides good syntax coloring for the DSL (symbols, keywords, strings, structural parens)

### Decoration widgets (`src/client/editor/widgets/`)

Each recognized DSL block type gets a widget:

- **`(media ...)`** → `Decoration.replace` with an `<img>` or `<video>` element. The source text is hidden; the rendered media is shown. Clicking the widget could open an edit popover for changing src/alt.
- **`(ref ...)`** → `Decoration.replace` with a styled link element pointing to `/n/slug`.
- **`(code :lang "...")`** → `Decoration.replace` with a syntax-highlighted code block (can use CM6's own highlighting for the nested language).
- Unknown forms → Render as-is with DSL syntax highlighting. No widget needed.

### Edit vs. Read mode

Both modes use the same CM6 setup. The difference:

- **Edit mode**: `EditorState.readOnly(false)`, full keybindings, save functionality.
- **Read mode**: `EditorState.readOnly(true)`, hide cursor, hide gutter, adjust padding/styling via CSS, no save keybindings.

A single function `createEditor(target, source, { readonly })` handles both.

### Styling

- **CM6 theme** (`src/client/editor/theme.ts`): All editor/widget styling lives here as `EditorView.theme()` and `HighlightStyle.define()` — pure TypeScript, no CSS file. Covers syntax colors, editor chrome, widget appearance, read vs edit differences.
- **`style.css`**: Only covers non-editor parts — page layout, list view, responsive breakpoints, base typography. Small (~100-150 lines).

---

## Server (Hono)

### API routes (`src/server/routes/api.ts`)

```
GET    /api/notes          → List all notes (slug, title, tags, public, created)
GET    /api/notes/:slug    → Return raw .edn source for a single note
PUT    /api/notes/:slug    → Write .edn source to disk (edit mode, local dev only)
DELETE /api/notes/:slug    → Delete a note file (local dev only)
POST   /api/notes          → Create a new note (generates slug from provided title or slug)
```

- **List endpoint**: Reads all `notes/*.edn`, parses metadata from each, returns a JSON index. Cache in memory, invalidate via fs watcher or on write.
- **Read endpoint**: `readFile` the `.edn` file, return as `{ source: string, metadata: object }`.
- **Write endpoint**: `writeFile` to `notes/{slug}.edn`. Validate that the source parses correctly before writing (use the shared parser). No auto-commit — user handles git manually or via Claude Code.
- **Write/delete endpoints are only active in development** (guard with an env check or middleware). Production deployment is read-only.

### Page routes (`src/server/routes/pages.ts`)

```
GET /edit/:slug   → Serve SPA shell (dev only)
GET /n/:slug      → Serve SPA shell (public note, readonly CM6)
GET /              → Serve SPA shell (note listing)
```

All three serve the same `index.html`. The client-side router reads the URL and initializes the appropriate view (edit, read, or list).

For public notes, inject `<meta>` tags (title, description, og:image) into the HTML response by parsing the note's metadata server-side before serving the shell. This gives social link previews without SSR.

### Notes module (`src/server/notes.ts`)

- `listNotes(dir)`: Glob `*.edn`, parse metadata from each, return sorted list.
- `readNote(slug)`: Read file, return raw source.
- `writeNote(slug, source)`: Validate parse, write file.
- `deleteNote(slug)`: Remove file.
- In-memory index: On startup, parse all notes. Expose `getIndex()`. Rebuild on file change.

---

## Client routing (`src/client/main.ts`)

Minimal client-side router. No library needed — read `window.location.pathname`, match patterns:

- `/edit/:slug` → Import and render edit view
- `/n/:slug` → Import and render read view
- `/` → Import and render list view

Use `history.pushState` for navigation between notes.

---

## Repo Layout

```
/
├── src/
│   ├── server/
│   │   ├── index.ts           # Hono app entry (Bun.serve)
│   │   ├── routes/
│   │   │   ├── api.ts         # Note CRUD API
│   │   │   └── pages.ts       # Serve SPA shell for /edit/:slug and /n/:slug
│   │   └── notes.ts           # Filesystem read/write, in-memory index
│   ├── client/
│   │   ├── main.ts            # Vite entry, router, init
│   │   ├── editor/
│   │   │   ├── language.ts    # CM6 LanguageSupport (Lezer + nested markdown)
│   │   │   ├── theme.ts       # CM6 theme (syntax colors, editor chrome, widgets)
│   │   │   ├── setup.ts       # createEditor(target, source, { readonly })
│   │   │   ├── decorations.ts # ViewPlugin for DSL form → widget replacement
│   │   │   └── widgets/       # Decoration widgets (media, ref, code blocks)
│   │   ├── views/
│   │   │   ├── edit.ts        # Edit view (CM6 editable)
│   │   │   ├── read.ts        # Public read view (CM6 readonly)
│   │   │   └── list.ts        # Note index/listing
│   │   └── style.css
│   └── shared/
│       └── parser/
│           ├── notes.grammar  # Lezer grammar definition
│           ├── parser.ts      # Compiled Lezer parser export
│           └── parse.ts       # Parse DSL → structured data (metadata extraction)
├── notes/                     # All notes live here as .edn files
├── media/                     # Images, videos referenced by notes
├── plans/                     # Implementation plans (this folder)
├── package.json
├── tsconfig.json
├── biome.json
└── vite.config.ts
```

---

## Build & Dev

### Vite config (`vite.config.ts`)

- Dev: Proxy `/api/*` requests to the Hono dev server.
- Build: Output static assets to `dist/client/`. The Hono server in production serves these.
- Lezer grammar compilation: Use `@lezer/generator` as a build step (Vite plugin or prebuild script) to compile the `.grammar` file into a JS parser.

### Dev workflow

1. `bun run dev` starts both Hono (watches `src/server/`) and Vite dev server (watches `src/client/`).
2. Edit notes at `http://localhost:5173/edit/my-note`.
3. Preview public version at `http://localhost:5173/n/my-note`.
4. Commit code + notes together via git / Claude Code.

### Production deployment

- Build client: `vite build` → `dist/client/`
- Build server: `bun build src/server/index.ts --outdir dist/server --target bun`
- Run: `bun dist/server/index.js` serves both the API (read-only) and static client assets.
- Deploy target: Any VPS, or a platform like Fly.io / Railway. Single process, no external dependencies.

---

## Phases

1. **Skeleton** — Bun + Hono + Vite dev setup, health check ✅
2. **Lezer Grammar & Parser** — Custom grammar, metadata extraction ✅
3. **Server API** — CRUD routes, in-memory index, sample notes ✅
4. **CodeMirror Editor** — Language support, edit/read views, nested markdown ✅
5. **Decoration Widgets** — media, ref, code widgets replacing DSL forms ✅
6. **Router & List View** — SPA navigation, note listing, tag filter ✅
7. **Polish & Production** — Styling, meta tags, build pipeline, dev guards

Each phase gets its own detailed plan (`plans/01-skeleton.md`, etc.) before implementation. Decisions can be rechallenged at each step.

---

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| File extension | `.edn` | Aligns with Clojure/EDN heritage |
| Runtime | Bun | Fast, native TS, simpler dev setup |
| Storage | Git + filesystem | Notes are code; version control is natural |
| Write path | Write to disk, commit manually | Simplest; Claude Code handles git |
| Production editing | None (read-only) | Honest about where editing works well |
| Public note rendering | CM6 readonly | Identical rendering, zero extra code, single code path |
| UI framework | Vanilla TS (no React/Solid) | CM6 is the UI; surrounding chrome is minimal |
| Server framework | Hono | Minimal, functional, Ring-like |
| Build tool | Vite | Zero-config TS/HMR, good CM6 integration |
| Linting/formatting | Biome | Fast (Rust), lint + format in one tool, minimal config |
| Database | None | In-memory index from filesystem, rebuilt on startup |
| Styling | CM6 theme (JS) + minimal CSS | Editor styles in TS, only app shell in CSS |
| Media storage | `/media/` in repo | Simple for v1; move to R2/S3 + Git LFS if it grows |

---

## Future Considerations (not in v1)

- **Backlink index**: Parse `(ref ...)` forms across all notes, build a reverse index, show "notes that reference this note" in the read view.
- **Full-text search**: Index note content with something like FlexSearch (in-browser) or a server-side index.
- **Markdown image rendering**: Render `![alt](url)` inside markdown strings as inline images (second layer of CM6 decorations on top of nested markdown parsing).
- **Mobile editing toolbar**: Custom buttons for inserting DSL forms, wrapping selections in parens, etc.
- **Static export**: Generate a fully static site from all public notes for CDN hosting.
- **Git LFS**: For the `media/` directory if repo size becomes an issue.
- **RSS feed**: For public notes, generated at build time.
- **Custom themes**: Multiple CM6 themes for the editor (dark/light/custom).
