# Handoff Note: html2docx

**Agents:** read [JANUS.md](./JANUS.md) (advisor / third source of truth) with BUILD_PLAN.md at session start.

## Current Status
- **Completed Stages:** 
  - Stage 0 (Scaffold) `[x]`
  - Stage 1 (CSS cascade engine) `[x]`
  - Stage 2 (Inline run formatting) `[x]`
  - Stage 3 (Block-level structure) `[x]`
- **Active Branch:** `main` (clean state, all Stage 0-3 changes merged)
- **Next Stage:** **Stage 4 — Lists** (owned by `[antigravity]`) or **Stage 5 — Tables** (owned by `[claude-code]`) — both only depend on Stage 0-3, no ordering constraint between them.

---

## Technical Details

### 1. Structure Created (Stage 0)
- All stub JS modules are created in `src/`.
- `bin/cli.js` acts as the command-line entry point.
- `scripts/verify.sh` runs the E2E verification (translating HTML -> DOCX buffer -> PDF via LibreOffice -> JPEG via pdftoppm).
  - *Note on host environment:* `soffice`/`pdftoppm` are not on the WSL PATH. Windows LibreOffice exists at `/mnt/c/Program Files/LibreOffice/program/soffice.exe` and works when invoked directly with `wslpath -w` UNC paths (used for Stage 3 visual verification). `pdftoppm` (poppler-utils) is still not installed anywhere on this host — see [docs/VERIFY.md](./docs/VERIFY.md).

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
  - `h1`-`h6` -> `Paragraph({ heading: HeadingLevel.HEADING_N, ... })`, with CSS color/size applied as **direct run formatting** (overrides Word's default Heading-style color, matches plan intent) via a seeded `inherited` base — see below.
  - `p` -> plain `Paragraph` of inline runs.
  - `blockquote` -> `Paragraph` with `indent.left = 720` DXA (0.5in) and a left `BorderStyle.SINGLE` border.
  - `pre` -> whitespace/newlines preserved **verbatim** (does NOT go through `convertInline`, which deliberately collapses whitespace — `getRawText()` + manual line-splitting instead), `Courier New` font per line, paragraph-level `shading` (`F5F5F5`) so the whole block width is shaded, not just the text.
  - `hr` -> empty `Paragraph` with a bottom border. Never a table.
  - Generic containers (`div`, `section`, `body`, `html`, `article`, etc.) are flattened by recursing into children — not mapped to anything themselves.
  - `ul`/`ol`/`table`/`img` are recognized tag names but return nothing for now — Stages 4/5/6 land the real handling; not guessed at here.
  - **Key mechanism:** a bare text node directly inside a block (e.g. `<h1>Title</h1>` or `<p class="lead">text</p>` with no wrapping `<span>`) has no `computedStyle` of its own. `collectInlineChildren()` resolves the block element's own tag+CSS formatting once via `resolveRunProps(node, node.computedStyle, BASE_PROPS)` (exported from `inline.js`) and passes it as `options.inherited` into `convertInline` for every child — so heading/paragraph-level color, size, weight etc. survive even without inline markup.
  - **Bug found + fixed during visual verification:** node-html-parser surfaces a leading `<!DOCTYPE html>` as a plain root-level *text* node (not a distinct node type) — was rendering as literal body text. `convertBlock` now filters any root-level text matching `/^<!doctype/i`. Regression-tested (`testDoctypeNotRenderedAsContent`).
- **`src/convert.js`** now wires this in for real: `convertBlock(root)` -> section children, falling back to a single empty `Paragraph` if there's no block content (OOXML requires at least one).
- **Tests:** [test/blocks.test.js](file:///home/marcus/html-docx/test/blocks.test.js), fixture [fixtures/blocks_full.html](file:///home/marcus/html-docx/fixtures/blocks_full.html) (headings w/ CSS color+size, tag-level CSS on bare text, bold+hyperlink nesting, blockquote, `pre`, `hr`). All 21 tests across all three suites passing (`npm test`).
- **Visually verified** via LibreOffice (Windows binary through WSL) -> PDF, read directly with the PDF reader tool (no `pdftoppm` on host): heading colors/sizes, bold/green tag-level CSS, hyperlink+bold nesting, blockquote indent+border, `pre` shading/monospace/preserved indentation, and `hr` as a rule (not a table) all render correctly.

---

## Instructions for the next stage owner
Both Stage 4 (Lists, `[antigravity]`) and Stage 5 (Tables, `[claude-code]`) only depend on Stage 0-3 and can run in parallel — see BUILD_PLAN.md for each stage's full spec.

For whichever lands next:
1. **Branch out:** `git checkout -b stage-4` or `stage-5` from `main`.
2. Reuse `convertInline` (Stage 2) for cell/list-item text content, and `cssColorToHex` (`src/color.js`) for any color/shading needs — don't reimplement.
3. `src/convert.js`'s `convertBlock(root)` call is the wiring point; a `table`/`ul`/`ol` handler added to `BLOCK_HANDLERS` (or a new dispatch) in `src/blocks.js` is how it reaches the document — `blocks.js` currently just returns `[]` for those tags as a placeholder.
4. Update `BUILD_PLAN.md` + this file when done; merge to `main` after `npm test` and a visual `scripts/verify.sh` pass (see Stage 3 notes above for the WSL LibreOffice workaround if `soffice` still isn't on PATH).
