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
**Status:** [x]

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

**Deviations from plan:** Heading/paragraph/blockquote color+size fidelity
required a small addition to Stage 2's `inline.js`: exported `BASE_PROPS`
and `resolveRunProps` (previously private) so `blocks.js` can resolve a
block element's own tag+CSS formatting and seed it as `convertInline`'s
`inherited` base. Without this, a bare text child with no wrapping `<span>`
(e.g. `<h1>Title</h1>` or `<p class="lead">...</p>` with the color/weight
set on the tag itself, not a child) would silently lose that styling —
confirmed by `testParagraphTagLevelCssAppliesToBareText` in
`test/blocks.test.js`. `convert.js` now calls `convertBlock(root)` and
falls back to a single empty `Paragraph` if a document has no block
content (OOXML requires at least one). Generic containers (`div`,
`section`, `body`, `html`, etc.) are flattened by recursion rather than
mapped to anything themselves. `ul`/`ol`/`table`/`img` are recognized but
intentionally skipped (return nothing) pending Stages 4-6, rather than
guessed at. Found and fixed a real bug during visual verification:
node-html-parser surfaces a leading `<!DOCTYPE html>` as a plain root-level
text node (not a distinct node type), which was rendering as literal body
text — `convertBlock` now filters it out; regression-tested in
`testDoctypeNotRenderedAsContent`. Host had no `soffice`/`pdftoppm` on
WSL PATH per `docs/VERIFY.md`, but Windows LibreOffice exists at
`/mnt/c/Program Files/LibreOffice/program/soffice.exe` — used that
directly (via `wslpath -w` for UNC paths) for one-off PDF conversion, then
read the PDF's rendered pages directly rather than rasterizing with
`pdftoppm` (not installed). Visual output confirmed: heading colors/sizes,
tag-level CSS on bare text, bold+hyperlink nesting, blockquote indent+left
border, `pre` monospace/shading/preserved indentation, and `hr` as a
bottom-border paragraph (not a table) all render correctly in LibreOffice.

---

## Stage 4 — Lists `[antigravity]`
**Status:** [x]

Implement `src/lists.js`: convert `ul`/`ol`, including arbitrary nesting
depth, into a real docx `numbering` config (`LevelFormat.BULLET` for `ul`,
`LevelFormat.DECIMAL` for top-level `ol`, alternating format per nesting
level like Word does) — never literal bullet characters. Each `li`'s
content still goes through inline formatting from Stage 2.

Test fixtures: nested mixed `ul`-inside-`ol`-inside-`ul`.

Mostly discovery-by-fixture work — good fit for fast iteration.

**Deviations from plan:** None. Registered list elements to dynamically generate unique numbering reference IDs for each individual list in the document, which correctly restarts numbering at 1 for separate decimal lists. Added an alternating template configuration for up to 9 nesting levels: alternating bullet shapes for `ul` and decimals/letters/romans for `ol`. Configured correct twip indentation for nested levels (`left` and `hanging` indents). Extracted first-child paragraph or div contents of list items to align with the list bullet, and recursively processed nested block-level elements. Updated blocks to align continuation paragraphs inside list items to the correct left indent.

---

## Stage 5 — Tables `[claude-code]`
**Status:** [x]

Implement `src/tables.js`: convert `table`/`thead`/`tbody`/`tr`/`th`/`td`
into a real docx `Table`.

- Header row (or `th` cells) -> bold text + shaded fill. Use
  `ShadingType.CLEAR`, **never** `SOLID` (solid renders black).
- Set explicit `columnWidths` on the table AND `width` on every cell, both
  in DXA, summing to the table width (percentage widths break in Google
  Docs).
- Respect `colspan`/`rowspan` if present.

Test fixtures: shaded-header table, table with merged cells.

**Deviations from plan:** `thead`/`tbody`/`tfoot` wrapping is flattened —
`convertTable` finds all descendant `<tr>` via `querySelectorAll` rather
than walking section-by-section; a row counts as a header row if it's
inside `<thead>`, and a cell counts as a header cell if it's a `<th>`
(either triggers bold+shaded, matching "header row (or th cells)" from the
spec literally). `rowspan`/`colspan` handling relies on docx's own
auto-generated `vMerge` continuation cells (confirmed in `docx`'s source:
setting `rowSpan` on the origin `TableCell` makes the `Table` constructor
inject the `CONTINUE` cells into subsequent rows itself) — `tables.js` only
needs to track, using the standard HTML table layout algorithm, which
columns are already occupied by an ongoing rowspan so it doesn't also
place one of the HTML's own `<td>`s there. Column count is inferred from
the same tracking walk (two passes: one to size `columnWidths`, one to
build cells) rather than requiring uniform `<td>` counts per row. Total
table width is a fixed 9000 DXA (~6.25in, typical content width) split
evenly across columns, with any remainder DXA absorbed by the last column
so the sum always matches exactly (verified in
`testColumnWidthsSumToTableWidth`). Each table cell's content collapses to
a **single paragraph** (reusing `resolveRunProps`/`BASE_PROPS` from
`inline.js`, same seeding pattern as Stage 3's headings, plus `bold: true`
forced for header cells) — nested block content inside a cell (e.g.
`<td><p>a</p><p>b</p></td>`) is not split into multiple paragraphs; out of
scope per the plan's spec, which doesn't mention block content in cells.
Table borders are explicit `BorderStyle.SINGLE` on all edges + inside
gridlines (docx's default empty `borders: {}` doesn't reliably render a
visible grid) rather than per-cell borders, since the plan's "real table
borders" goal needs *some* explicit border and table-level covers every
cell uniformly with less code. Wired into `blocks.js`'s existing
`BLOCK_HANDLERS` dispatch (which Stage 4/lists had already extended with
an `options.convertBlock` circular-dependency hook by the time this
landed) — `table` needed no changes to that machinery, just a new entry.
Visually verified via LibreOffice (Windows binary through WSL, see Stage 3
notes): shaded/bold header, unshaded data rows, nested `<strong>` inside a
cell, rowspan merge (no duplicated text), and colspan merge all render
correctly.

---

## Stage 6 — Images `[antigravity]`
**Status:** [x]

Implement `src/images.js`: handle `<img>` with base64 `data:` URIs (decode
directly) and remote `src` URLs (fetch, cap at a reasonable size/timeout,
skip with a console warning on failure rather than crashing the whole
conversion). Use docx `ImageRun` with explicit `type`. Preserve
`width`/`height` from HTML/CSS attributes where present, scaled to
reasonable docx dimensions.

No dependency on Stages 2/3/5 — safe to run in parallel with Stage 1.

**Deviations from plan:** Asynchronous image prefetching in `convert.js` before
the DOM walk so block/inline conversion stays synchronous. Supports inline
`<img>` via `convertInline` + block `<img>` via `BLOCK_HANDLERS`. Dimensions
from attributes or CSS (`width`/`height` on computedStyle). Fetch caps: 5MB /
5s timeout; failures warn and skip.

**Janus review (2026-07-20):** ACCEPT after fix — remote images inside
paragraphs/cells/list items dropped `imageBuffers` because callers passed only
`{ inherited }` into `convertInline`. Plumbing fixed in blocks/lists/tables;
regression `testInlineRemoteImageUsesPrefetchBuffers`. See
`docs/reviews/2026-07-20-stage-6.md`. Local file paths still unsupported (P2).


---

## Stage 7 — CLI + verification loop `[claude-code]`
**Status:** [x]

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

**Deviations from plan:** `bin/cli.js` rewritten with manual arg parsing
(no new dependency). Directory input requires `--outdir` (ambiguous
otherwise); a single file/URL input can use `--outdir` too if `-o` is
omitted, output name derived from the input basename. `-f odt` shells out
to the already-installed `pandoc` on a temp `.docx` (cleaned up after);
errors clearly if `pandoc` is missing rather than failing silently.
`--reference TEMPLATE` unzips the template `.docx` (via `jszip`, promoted
from `devDependencies` to `dependencies` since it's now used at runtime,
not just in tests) and passes its raw `word/styles.xml` through to docx's
`externalStyles` — confirmed via `jszip`-diffed output that the reference
template's style content actually lands in the generated file, and that
LibreOffice opens/converts the result cleanly. `--toc` inserts a real
`TableOfContents` field (`headingStyleRange: "1-6"`, `updateFields: true`
in document settings so Word refreshes it on open) — **found and fixed a
real bug via the LibreOffice PDF verify step**: LibreOffice's headless
`--convert-to pdf` never refreshes field-based TOCs (only Word does, on
open), so the field rendered as a blank gap in the PDF. Fixed by also
populating `cachedEntries` (title + heading level, collected from the DOM
in document order) so the TOC has real static content in any viewer that
doesn't refresh fields — Word still recomputes it (including page
numbers) from the field on open. Regression-tested structurally
(`testTocFlagInsertsRealTocField` asserts cached entry text inside the
`<w:sdt>`) since the visual defect wouldn't show up in an XML-presence
check alone. **Always-verify default implemented as a soft-fail**, not
hard-required: the built-in `verifyOutput()` (`src/verify.js`) always runs
LibreOffice PDF conversion after every write and prints the PDF/JPEG
paths, but a failure (e.g. no LibreOffice on the host at all) only warns —
it doesn't abort the whole command or exit non-zero, since forcing every
`html2docx` invocation to require a working LibreOffice install felt wrong
for a general-purpose CLI (that bar makes more sense for *this repo's own*
dev-loop DoD, which already has `scripts/verify.sh`). `--no-verify` opts
out entirely for batch-mode throughput; `--strict-raster`
(or `STRICT_RASTER=1`, same convention as `scripts/verify.sh`) makes a
missing `pdftoppm` specifically fail rather than warn. `src/verify.js` is
a new shared module (reused by nothing else yet, but factored out of
`bin/cli.js` rather than inlined so it's independently testable and so
`scripts/verify.sh` could be pointed at it later instead of duplicating
the LibreOffice-wrapper invocation). Visually verified via the CLI's own
default verify path: single-file conversion, `--toc` (confirmed the
cached-entries fix — TOC now shows "Report Title"/"Section" with dot
leaders instead of a blank gap), and `--reference` (confirmed LibreOffice
opens/converts the merged-styles output without error). 15 new tests in
`test/cli.test.js` (pure-function unit tests for arg parsing/path
resolution + spawned end-to-end tests for every flag, directory batch,
URL input via a local HTTP server, and error paths), run with
`--no-verify` to stay host-independent in CI; the always-on verify default
itself is exercised separately via manual LibreOffice runs per DoD.

**Janus review (2026-07-20):** ACCEPT — full flag surface, TOC LO
`cachedEntries` fix verified in PDF (heading lines + leaders), odt/batch
smoke OK. Soft-fail verify is accepted as CLI product choice; stage DoD
still requires hard PDF when reviewing layout. See
`docs/reviews/2026-07-20-stage-7.md`.

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
   update it after finishing a stage (status + deviations).
2. One git branch per stage. Merge to `main` only when **Definition of done**
   below is met — not when the chat “feels done.”
3. One tool owns one stage, start to finish — no mid-stage handoffs.
4. **Git is ground truth for branch/clean/merged.** `HANDOFF.md` must match
   `git status -sb` and `git log -1 --oneline`. Never write “clean state” or
   “merged to main” unless those commands agree. If docs and git disagree, git wins;
   fix the docs in the same session.
5. **Definition of done** before marking a stage **`[x]`** and before claiming
   complete in HANDOFF:
   - [ ] Implementation on the stage branch
   - [ ] `npm test` green (including new suite files in `package.json`)
   - [ ] BUILD_PLAN deviations filled if behavior ≠ original bullets
   - [ ] Merged to `main` (merge commit or FF on `main`)
   - [ ] Working tree clean *or* only unrelated files, called out in HANDOFF
   - [ ] **Layout-sensitive stages (3+ blocks/lists/tables/images):** LibreOffice
         PDF via `scripts/verify.sh` or `scripts/office/soffice.py` on the stage
         fixtures — owner records paths; JPEG via `pdftoppm` optional unless
         `STRICT_RASTER=1`
   - [ ] **Janus formal accept** when Marcus requires third-source review:
         `docs/reviews/YYYY-MM-DD-stage-N.md` with ACCEPT, committed to `main`
   - [ ] HANDOFF Current Status rewritten from live git (HEAD, dirty, next stage,
         link to Janus review if any)
6. `npm test` green alone is **not** done for stages that touch Word layout
   (shading, widths, numbering, merges, images).
7. Antigravity may own batch screenshot review after Claude finishes a sequential
   batch; that does not replace Janus accept when Marcus asked for it.
8. Read **[JANUS.md](./JANUS.md)** at session start.
