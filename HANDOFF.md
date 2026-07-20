# Handoff Note: html2docx

**Agents:** read [JANUS.md](./JANUS.md) (advisor / third source of truth) with BUILD_PLAN.md at session start.

## Current Status
- **Completed Stages:** 
  - Stage 0 (Scaffold) `[x]`
  - Stage 1 (CSS cascade engine) `[x]`
  - Stage 2 (Inline run formatting) `[x]`
  - Stage 3 (Block-level structure) `[x]`
  - Stage 4 (Lists) `[x]`
  - Stage 5 (Tables) `[x]`
- **Active Branch:** `main` (clean state, all Stage 0-5 changes merged)
- **Next Stage:** **Stage 6 — Images** (owned by `[antigravity]`) or **Stage 7 — CLI + verification loop** (owned by `[claude-code]`) — Stage 7 needs 0-5 wired end-to-end (now true) but doesn't need Stage 6; no ordering constraint between them.

---

## Technical Details

### 1. Structure Created (Stage 0) & Visual Verify Fixes
- All stub JS modules are created in `src/`.
- `bin/cli.js` acts as the command-line entry point.
- `scripts/office/soffice.py` has been rewritten to support WSL seamlessly. It detects if the Windows LibreOffice binary is selected, copies the input `.docx` file to a temporary directory in writeable `/mnt/c/temp/`, converts it there, moves the generated `.pdf` back to the outdir, and cleans up. PDF generation now works perfectly on this WSL host!
- `scripts/verify.sh` converts HTML -> DOCX -> PDF -> JPEG. Note: `pdftoppm` is still missing on the WSL PATH, but the PDF is successfully generated and verified.

### 2. CSS Engine Implemented (Stage 1)
- **File:** [src/style.js](file:///home/marcus/html-docx/src/style.js)
- `applyStylesToTree(rootNode, defaultRootFontSize)`: walks the DOM, resolves/attaches computed styles to every element in `node.computedStyle`. Supports tag/`.class`/`#id`/`tag.class`/`tag#id`/`*` selectors, specificity (ID=100/class=10/tag=1), inheritance of `color`/`font-family`/`font-size`/`font-weight`/`font-style`/`text-decoration`, and px/pt/em/rem/% font-size resolution to `"Npt"` strings.
- **Tests:** [test/style.test.js](file:///home/marcus/html-docx/test/style.test.js) — all passing.

### 3. Inline Run Formatting Implemented (Stage 2)
- **File:** [src/inline.js](file:///home/marcus/html-docx/src/inline.js)
- `convertInline(node, computedStyle, options)`: given an inline-level DOM node (text or element, `computedStyle` from Stage 1), recursively returns a flat `Array<TextRun|ExternalHyperlink>`.
  - Tag semantics: `<strong>`/`<b>` bold, `<em>`/`<i>` italics, `<u>` underline, `<s>`/`<strike>`/`<del>` strike, `<code>` monospace (`Courier New`) + shading (`EDEDED`, `ShadingType.CLEAR`), `<br>` -> `TextRun({ break: 1 })` (no `Break` class in docx v9), `<a href>` -> real `ExternalHyperlink` with `style: "Hyperlink"` runs (direct CSS formatting still overrides, matching Word precedence).
  - Tag-implied and CSS-resolved formatting combine via OR down the tree.
  - **Exports used by Stage 3:** `BASE_PROPS` and `resolveRunProps(node, computedStyle, inherited)` — resolves a single node's own tag+CSS formatting; `blocks.js` uses this to seed bare text children (see Stage 3 notes below).
  - Color conversion lives in **`src/color.js`** (`cssColorToHex`) — hex/`rgb()`/`rgba()`/147 named colors -> docx 6-digit hex. Shared by Stage 3 (heading colors) and reusable by Stage 5 (table shading).
  - `font-size` (`"Npt"` string from Stage 1) -> half-points for docx's `size`.
- **Tests:** [test/inline.test.js](file:///home/marcus/html-docx/test/inline.test.js) — builds real docx output via `Packer.toBuffer`, unzips with `jszip` (devDependency), asserts on actual `word/document.xml` markup. All passing.

### 4. Block-Level Structure Implemented (Stage 3)
- **File:** [src/blocks.js](file:///home/marcus/html-docx/src/blocks.js)
- `convertBlock(node, options)`: converts a block-level element (or recurses through a generic container) to docx block components.
  - `h1`-`h6` -> `Paragraph({ heading: HeadingLevel.HEADING_N, ... })`, with CSS color/size applied as **direct run formatting** (overrides Word's default Heading-style color, matches plan intent) via a seeded `inherited` base.
  - `p` -> plain `Paragraph` of inline runs.
  - `blockquote` -> `Paragraph` with `indent.left = 720` DXA (0.5in) and a left `BorderStyle.SINGLE` border.
  - `pre` -> whitespace/newlines preserved **verbatim** (does NOT go through `convertInline`, which deliberately collapses whitespace — `getRawText()` + manual line-splitting instead), `Courier New` font per line, paragraph-level `shading` (`F5F5F5`) so the whole block width is shaded, not just the text.
  - `hr` -> empty `Paragraph` with a bottom border. Never a table.
  - Generic containers (`div`, `section`, `body`, `html`, `article`, etc.) are flattened by recursing into children — not mapped to anything themselves.
  - **Key mechanism:** a bare text node directly inside a block (e.g. `<h1>Title</h1>` or `<p class="lead">text</p>` with no wrapping `<span>`) has no `computedStyle` of its own. `collectInlineChildren()` resolves the block element's own tag+CSS formatting once via `resolveRunProps(node, node.computedStyle, BASE_PROPS)` (exported from `inline.js`) and passes it as `options.inherited` into `convertInline` for every child — so heading/paragraph-level color, size, weight etc. survive even without inline markup.
  - **Bug found + fixed during visual verification:** node-html-parser surfaces a leading `<!DOCTYPE html>` as a plain root-level *text* node (not a distinct node type) — was rendering as literal body text. `convertBlock` now filters any root-level text matching `/^<!doctype/i`. Regression-tested (`testDoctypeNotRenderedAsContent`).
- **`src/convert.js`** wires this in: `convertBlock(root)` -> section children.
- **Tests:** [test/blocks.test.js](file:///home/marcus/html-docx/test/blocks.test.js). All passing.

### 5. Lists Implemented (Stage 4)
- **File:** [src/lists.js](file:///home/marcus/html-docx/src/lists.js)
- `convertList(node, options)`: converts `ul`/`ol` list nodes recursively:
  - Generates a new unique `numbering` configuration reference (e.g., `ul-list-ref-1`) for every top-level list to ensure correct restart behavior (so separate numbered lists start back at 1 instead of continuing).
  - Configures 9 levels of nesting with alternating formats: bullets (•, o, ▪) for `ul`, and decimals/letters/romans (%1., %2., %3.) for `ol`.
  - Configures standard left indent (`(level + 1) * 720` twips/DXA) and hanging indent (`360` twips/DXA) per nesting level.
  - Extracts the first child paragraph or div of an `<li>` so its text aligns with the bullet rather than generating empty bullets.
  - Indents list continuation paragraphs (e.g., `<p>` inside `<li>` that follows the main text) to align with the list item indentation.
  - Shares the `convertBlock` dispatcher on `options` to break circular dependency dynamically.
- **Tests:** [test/lists.test.js](file:///home/marcus/html-docx/test/lists.test.js) & fixture [fixtures/lists_full.html](file:///home/marcus/html-docx/fixtures/lists_full.html). Asserts nested levels, numbering XML config existence, numbering formats, inline styles, and separate list restart numIds. All passing.
- **Visually verified** via PDF converter tool rendering showing perfect alignment, bullet alternation, decimal formats, and restart numbering.

### 6. Tables Implemented (Stage 5)
- **File:** [src/tables.js](file:///home/marcus/html-docx/src/tables.js)
- `convertTable(node, options)`: converts an HTML `<table>` to a real docx `Table`.
  - `thead`/`tbody`/`tfoot` wrapping is flattened — finds all descendant `<tr>` via `querySelectorAll('tr')` directly rather than walking section-by-section.
  - A row counts as a header row if it's inside `<thead>`; a cell counts as a header cell if it's a `<th>`. Either triggers bold text + `D9D9D9` shading (`ShadingType.CLEAR`, never `SOLID`).
  - `colspan`/`rowspan` respected via the standard HTML table layout algorithm (`walkRows()` tracks which columns are still "occupied" by an ongoing rowspan from an earlier row) — **docx auto-generates the `vMerge` CONTINUE cells itself** once you set `rowSpan` on the origin `TableCell` (confirmed in `docx`'s own source), so `tables.js` only needs to avoid placing one of the HTML's own `<td>`s in an already-occupied column, not build the continuation cells by hand.
  - Table width is fixed at 9000 DXA (~6.25in), split evenly across columns (remainder absorbed by the last column so the sum is always exact) — both `columnWidths` on the `Table` and `width` on every `TableCell` are explicit DXA, never percentage (percentage breaks in Google Docs, per the plan).
  - Each cell's content is a **single paragraph** — reuses `resolveRunProps`/`BASE_PROPS` from `inline.js` (same pattern as Stage 3 headings) to seed bare cell text, with `bold: true` forced for header cells. Nested block content in a cell (e.g. multiple `<p>`s) is not split into multiple paragraphs — out of scope per the plan.
  - Explicit `BorderStyle.SINGLE` borders on all table edges + inside gridlines (docx's default empty `borders: {}` option doesn't reliably draw a visible grid).
  - Registered as `table: convertTable` in `BLOCK_HANDLERS` in `src/blocks.js` — no changes needed to the existing `options.convertBlock`/list-indent machinery from Stage 4.
- **Tests:** [test/tables.test.js](file:///home/marcus/html-docx/test/tables.test.js) (8 tests) + fixtures [fixtures/table_shaded_header.html](file:///home/marcus/html-docx/fixtures/table_shaded_header.html), [fixtures/table_merged_cells.html](file:///home/marcus/html-docx/fixtures/table_merged_cells.html). All 32 tests across all suites passing (`npm test`).
- **Visually verified** via LibreOffice (Windows binary through WSL, see Stage 3 notes for the `soffice.exe`/`wslpath -w` approach): shaded+bold header row, unshaded data rows, `<strong>` nested inside a cell, rowspan merge with no duplicated "Q1" text, and colspan merge spanning the full table width all render correctly.

---

## Instructions for the next stage owner

Both Stage 6 (Images, `[antigravity]`) and Stage 7 (CLI + verification loop, `[claude-code]`) can proceed now — see `BUILD_PLAN.md` for each stage's full spec. Reuse `convertInline`/`cssColorToHex`/`resolveRunProps`+`BASE_PROPS` rather than reimplementing; register any new block handler in `BLOCK_HANDLERS` in `src/blocks.js`. Update `BUILD_PLAN.md` + this file and merge to `main` after `npm test` and a visual `scripts/verify.sh` pass (LibreOffice via `soffice.exe`/`wslpath -w` if `soffice` still isn't on the WSL PATH, per Stage 3's notes above) when done.
