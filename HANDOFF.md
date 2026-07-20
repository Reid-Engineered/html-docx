# Handoff Note: html2docx

**Agents:** read [JANUS.md](./JANUS.md) (advisor / third source of truth) with BUILD_PLAN.md at session start.

## Current Status
- **Completed Stages:** 
  - Stage 0 (Scaffold) `[x]`
  - Stage 1 (CSS cascade engine) `[x]`
  - Stage 2 (Inline run formatting) `[x]`
- **Active Branch:** `main` (clean state, all Stage 0-2 changes merged)
- **Next Stage:** **Stage 3 — Block-level structure** (owned by `[claude-code]`)

---

## Technical Details

### 1. Structure Created (Stage 0)
- All stub JS modules are created in `src/`.
- `bin/cli.js` acts as the command-line entry point.
- `scripts/verify.sh` runs the E2E verification (translating HTML -> DOCX buffer -> PDF via LibreOffice -> JPEG via pdftoppm).
  - *Note on host environment:* LibreOffice (`soffice`) and `pdftoppm` are not currently installed on the host. `scripts/verify.sh` is written to catch this and log a helpful reminder, whilst still successfully executing Step 1 (HTML -> DOCX).

### 2. CSS Engine Implemented (Stage 1)
- **File:** [src/style.js](file:///home/marcus/html-docx/src/style.js)
- **Functions:**
  - `applyStylesToTree(rootNode, defaultRootFontSize)`: Walks the DOM tree and resolves/attaches computed styles to all element nodes in `node.computedStyle`.
  - Supports: tag, `.class`, `#id`, `tag.class`, `tag#id`, and `*` selectors.
  - Calculates specificity: ID = 100, Class = 10, Tag = 1.
  - Inherits specific properties down the DOM stack: `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-decoration`.
  - Resolves absolute/relative font sizes (`px`, `pt`, `em`, `rem`, `%`) to standard `pt` values (e.g., `18pt`).
- **Tests:** `npm test` runs a full suite of CSS resolution tests in [test/style.test.js](file:///home/marcus/html-docx/test/style.test.js). All tests are currently passing.

### 3. Inline Run Formatting Implemented (Stage 2)
- **File:** [src/inline.js](file:///home/marcus/html-docx/src/inline.js)
- **Function:** `convertInline(node, computedStyle, options)`: given an
  inline-level DOM node (text node or element, with `computedStyle` already
  attached by Stage 1's `applyStylesToTree`), recursively walks its subtree
  and returns a flat `Array<TextRun|ExternalHyperlink>`.
  - Tag semantics handled: `<strong>`/`<b>` -> bold, `<em>`/`<i>` -> italics,
    `<u>` -> underline, `<s>`/`<strike>`/`<del>` -> strikethrough, `<code>`
    -> monospace font (`Courier New`) + light gray shading (`EDEDED`,
    `ShadingType.CLEAR` — never `SOLID`), `<br>` -> `TextRun({ break: 1 })`
    (docx v9 has no `Break` class), `<a href>` -> real `ExternalHyperlink`
    with runs styled `style: "Hyperlink"` (docx's built-in blue/underline
    character style).
  - Tag-implied formatting and CSS-resolved formatting (from
    `node.computedStyle`) combine via OR down the tree — either can turn
    bold/italics/underline/strike on; explicit CSS `color`/`font-weight`/
    etc. on a node always overrides inherited values, including on runs
    inside a hyperlink (direct formatting beats the `Hyperlink` style,
    matching Word's precedence rules).
  - Color conversion (`hex` / `rgb()` / `rgba()` / 147 named CSS colors ->
    docx 6-digit hex) lives in **`src/color.js`** (`cssColorToHex`) — a new
    shared util, not in the original file list, added because Stage 3
    (heading colors) and Stage 5 (table shading) need the identical
    conversion.
  - `font-size` (already normalized to a `"Npt"` string by Stage 1) is
    converted to half-points for docx's `size` property.
- **Tests:** [test/inline.test.js](file:///home/marcus/html-docx/test/inline.test.js)
  builds a real one-paragraph `Document`, runs `Packer.toBuffer`, unzips it
  with `jszip` (new devDependency), and asserts on the actual
  `word/document.xml` / `word/_rels/document.xml.rels` markup — not
  internal object shape, since docx doesn't expose a way to read options
  back off a built `TextRun`. Fixtures added: `fixtures/inline_formatting.html`
  (bold/italic/underline/strike/`<br>`), `fixtures/code_inline.html`,
  `fixtures/links.html` (plain + CSS-styled link), `fixtures/nested_formatting.html`
  (bold inside a link inside a color-styled span — the plan's example
  case), `fixtures/spans.html` (inline color/weight, inline
  background-color -> shading). `npm test` runs both Stage 1 and Stage 2
  suites; all passing.

---

## Instructions for `[claude-code]` (Stage 3)
1. **Branch out:** Create and switch to a new branch `stage-3` (`git checkout -b stage-3`).
2. **Implementation target:** Implement `src/blocks.js`:
   - `h1`-`h6` -> real `HeadingLevel.HEADING_1`-`6`, pulling color/size from
     computed style rather than docx defaults.
   - `p` -> normal paragraph composed of inline runs from `convertInline`
     (Stage 2, `src/inline.js`) — loop over a paragraph's `childNodes` and
     spread `convertInline(child)` for each, same pattern used in
     `test/inline.test.js`'s `renderParagraph` helper.
   - `blockquote` -> indented paragraph with a left border.
   - `pre` -> monospace-shaded block preserving whitespace/line breaks
     (note: `convertInline`'s text-node handling collapses whitespace with
     `/\s+/g -> ' '`, which is wrong for `<pre>` — `pre` content will need
     its own text handling, not a pass through `convertInline`).
   - `hr` -> paragraph with a bottom border (never a table).
   - Reuse `cssColorToHex` from `src/color.js` for heading colors rather
     than reimplementing color parsing.
3. **Verify:** Wire into `src/convert.js` so a fixture with
   headings/paragraphs/blockquotes converts end to end. Run
   `scripts/verify.sh` and visually confirm output before marking done.
4. **Update files:** Upon completion of Stage 3:
   - Update the status in [BUILD_PLAN.md](file:///home/marcus/html-docx/BUILD_PLAN.md).
   - Update this `HANDOFF.md` file to reflect progress.
   - Merge `stage-3` into `main` after verifying.
