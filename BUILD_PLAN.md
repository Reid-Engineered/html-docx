# html2docx — Build Plan

A converter that parses real HTML/CSS and re-emits it as native Word objects
(real heading styles, real numbered/bulleted lists, real table borders and
cell shading, real bold/italic/color runs, real hyperlinks) instead of
pandoc's generic pass-through. Pixel-perfect fidelity isn't the goal — that's
a PDF problem, not a docx problem — but the styling that *can* survive a flow
document (colors, weights, structure, spacing) should survive.

**Owners key:** `[claude-code]` · `[antigravity]` · `[either]` · `[janus]`
Whichever **implementer** starts a stage owns it start to finish — never split one
stage across implementers mid-stream.

**`[janus]`** is the third source of truth (advisor / host verify / docs) — not a
default feature owner. All agents: read **[JANUS.md](./JANUS.md)** at session
start. Standing review: [docs/JANUS_REVIEW.md](./docs/JANUS_REVIEW.md).

Implementers **and** Janus: **read this file before starting a session, and update it
immediately after finishing a stage** (status + any deviations from plan).
Treat this file as ground truth over whatever a chat prompt said three days
ago.

---

## Status legend
`[ ]` not started · `[~]` in progress · `[x]` done + verified

---

## Stage 0 — Scaffold `[either]`
**Status:** [x]

Set up a Node.js project called `html2docx`. Use `docx` (npm — already know
the API, don't reinvent it) and `node-html-parser` for parsing.

Structure:
```
src/parse.js     - HTML -> DOM + CSS cascade entry point
src/style.js     - computed-style resolution
src/blocks.js    - block-level element -> docx mapping
src/inline.js    - inline run formatting
src/lists.js
src/tables.js
src/images.js
src/convert.js   - orchestrator
bin/cli.js
fixtures/        - test HTML files, one small file per feature
scripts/verify.sh
```

`scripts/verify.sh` converts a fixture, renders it to PDF via LibreOffice
headless, and rasterizes with `pdftoppm` so output can be visually
inspected:
```bash
python scripts/office/soffice.py --headless --convert-to pdf output.docx
pdftoppm -jpeg -r 100 output.pdf page
```

No implementation yet beyond a stub pipeline that reads HTML and writes an
empty docx.

**Deviations from plan:** None. Created the project scaffold, initialized npm, installed dependencies, set up stub file structure, and confirmed that the conversion stage runs and produces a valid output.docx. Note that LibreOffice (soffice) and pdftoppm are not yet installed on the host system, so PDF/image rasterization steps in the verification script currently raise expected warnings.

---

## Stage 1 — CSS cascade engine `[antigravity]`
**Status:** [x]

Implement `src/style.js`: parse any `<style>` blocks into selector -> property
rules. Support tag, `.class`, `#id`, and combined `tag.class` selectors with
basic specificity (id > class > tag; later rules win ties on equal
specificity). Walk the DOM maintaining a style stack; at each node, merge (in
order) inherited properties from ancestors, matching rules, then inline
`style=""` (highest priority).

Inheritable properties: `color`, `font-family`, `font-size`, `font-weight`,
`font-style`, `text-decoration`.

Test fixtures needed:
- tag selector only
- class override
- inline override
- nested inheritance
- em/rem sizing relative to parent context

This is the stage most about rapid iteration/discovery (specificity edge
cases, inheritance quirks) — good fit for fast exploratory cycles.

**Deviations from plan:** None. All requested selectors, specificity, inheritance, style-stack walking, and em/rem/percentage sizing calculations are fully implemented and verified via unit tests and fixtures.

---

## Stage 2 — Inline run formatting `[claude-code]`
**Status:** [x]

Implement `src/inline.js`: given an inline-level DOM node and its computed
style (from Stage 1), produce docx `TextRun` / `ExternalHyperlink` objects.

Handle:
- `<strong>` / `<b>` -> bold
- `<em>` / `<i>` -> italics
- `<u>` -> underline
- `<s>` / `<strike>` / `<del>` -> strikethrough
- `<code>` -> monospace font + light gray shading (use the `shading`
  property on `TextRun` — confirmed available in docx v9, `IRunOptions`
  includes `shading?: IShadingAttributesProperties`)
- `<a href>` -> real `ExternalHyperlink`, not plain colored text
- `<span>` with inline color/background/weight/style
- `<br>` -> docx `Break`

Conversions:
- CSS color (hex / `rgb()` / named) -> docx hex
- `font-weight >= 600` or `bold` keyword -> bold
- px/pt/em -> half-points for `size`

Test against fixtures with mixed/nested inline formatting (e.g. bold inside
a link inside a color-styled span).

**Deviations from plan:** Added `src/color.js` (not in the original file
list) as a shared CSS-color-to-hex utility — handles hex/`rgb()`/`rgba()`/
147 named CSS colors — since blocks.js (Stage 3, heading colors) and
tables.js (Stage 5, cell shading) will need the same conversion; keeping it
in inline.js would mean duplicating it later. Tag-semantic formatting
(`<strong>`, `<em>`, `<u>`, `<s>`/`<strike>`/`<del>`, `<code>`) is combined
with CSS-resolved properties via OR-accumulation down the tree (either can
turn a property on; CSS doesn't turn tag-implied bold back off) — simplest
model that satisfies nested/mixed-formatting fixtures. Hyperlink runs get
`style: "Hyperlink"` (docx's built-in character style, blue+underline) so
links look like links by default, while any explicit CSS color/weight on
the node still applies as direct formatting on top, correctly overriding
the style default (matches Word's direct-formatting-wins behavior). Tests
(`test/inline.test.js`) render real docx output via `Packer.toBuffer` and
inspect the actual `word/document.xml` (unzipped with `jszip`, added as a
devDependency) rather than internal object shape, since docx doesn't expose
a way to read options back off a built `TextRun`/`ExternalHyperlink`.

---

## Stage 3 — Block-level structure `[claude-code]`
**Status:** [ ]

Implement `src/blocks.js`:
- `h1`-`h6` -> real `HeadingLevel.HEADING_1`-`6`, pulling color/size from
  computed style rather than docx defaults (a CSS-styled heading keeps its
  brand color/size, not Word's default blue)
- `p` -> normal paragraph composed of inline runs from Stage 2
- `blockquote` -> indented paragraph with a left border
- `pre` -> monospace-shaded block preserving whitespace/line breaks
- `hr` -> paragraph with a bottom border (never use a table as a rule)

Wire into `src/convert.js` so a fixture with headings/paragraphs/blockquotes
converts end to end. Run `scripts/verify.sh` and visually confirm output
before marking done.

**Deviations from plan:**

---

## Stage 4 — Lists `[antigravity]`
**Status:** [ ]

Implement `src/lists.js`: convert `ul`/`ol`, including arbitrary nesting
depth, into a real docx `numbering` config (`LevelFormat.BULLET` for `ul`,
`LevelFormat.DECIMAL` for top-level `ol`, alternating format per nesting
level like Word does) — never literal bullet characters. Each `li`'s
content still goes through inline formatting from Stage 2.

Test fixtures: nested mixed `ul`-inside-`ol`-inside-`ul`.

Mostly discovery-by-fixture work — good fit for fast iteration.

**Deviations from plan:**

---

## Stage 5 — Tables `[claude-code]`
**Status:** [ ]

Implement `src/tables.js`: convert `table`/`thead`/`tbody`/`tr`/`th`/`td`
into a real docx `Table`.

- Header row (or `th` cells) -> bold text + shaded fill. Use
  `ShadingType.CLEAR`, **never** `SOLID` (solid renders black).
- Set explicit `columnWidths` on the table AND `width` on every cell, both
  in DXA, summing to the table width (percentage widths break in Google
  Docs).
- Respect `colspan`/`rowspan` if present.

Test fixtures: shaded-header table, table with merged cells.

**Deviations from plan:**

---

## Stage 6 — Images `[antigravity]`
**Status:** [ ]

Implement `src/images.js`: handle `<img>` with base64 `data:` URIs (decode
directly) and remote `src` URLs (fetch, cap at a reasonable size/timeout,
skip with a console warning on failure rather than crashing the whole
conversion). Use docx `ImageRun` with explicit `type`. Preserve
`width`/`height` from HTML/CSS attributes where present, scaled to
reasonable docx dimensions.

No dependency on Stages 2/3/5 — safe to run in parallel with Stage 1.

**Deviations from plan:**

---

## Stage 7 — CLI + verification loop `[claude-code]`
**Status:** [ ]

Wire everything into `bin/cli.js`. Same interface as the earlier
`html2doc.py` prototype:
- file / directory / URL input
- `-o` output path
- `-f docx|odt` (odt via pandoc fallback path if needed)
- `--outdir` for batch mode
- `--toc`
- `--reference TEMPLATE` — merge in an external Word style template
  (docx skill's reference-doc pattern)

After conversion, always run the LibreOffice-headless -> PDF -> pdftoppm
verify step and report output image paths for visual confirmation before
trusting the result.

**Deviations from plan:**

---

## Stage 8 — Polish / edge-case hardening `[antigravity]`
**Status:** [ ]

Harden edge cases:
- empty elements
- malformed / unclosed HTML tags (node-html-parser should tolerate this —
  add fixtures to confirm)
- deeply nested spans
- CSS shorthand properties (e.g. `font: bold 14px/1.4 sans-serif`)
- a `--theme` override CLI flag to force a color/font palette regardless of
  source CSS

Fixture-bashing stage — good fit for fast iteration. Use Antigravity's
screenshot-based verification against each fixture to flag regressions
without manual `pdftoppm` review of every case.

**Deviations from plan:**

---

## Known limits (won't fully solve, by design)
- Absolute/fixed positioning, CSS grid, multi-column layouts, overlapping
  elements — docx is a flow-document format, these flatten into normal flow
- Custom `@font-face` fonts won't auto-embed (Word can embed fonts but
  embedding/licensing flags get messy) — falls back to closest system font
- Anything JS-rendered isn't in the static HTML to begin with, so it's not
  in scope

## Coordination rules
1. One `BUILD_PLAN.md` (this file) — both tools read it before starting,
   update it after finishing.
2. One git branch per stage, merge to `main` only after `verify.sh` passes.
3. One tool owns one stage, start to finish — no mid-stage handoffs.
4. Antigravity owns the visual verification step (screenshots/recordings
   against `scripts/verify.sh` output) after Claude Code finishes a
   sequential-stage batch.
