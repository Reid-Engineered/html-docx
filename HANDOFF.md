# Handoff Note: html2docx

**Agents:** read [JANUS.md](./JANUS.md) + [BUILD_PLAN.md](./BUILD_PLAN.md) at session start.  
**Git is ground truth.** Before editing this file, run `git status -sb` and `git log -1 --oneline`. Never claim “clean” or “merged” unless those agree.

---

## Current Status (authoritative — update every session end)

> **Regenerate this block from git, do not prose-edit from memory.**

| Field | Value |
|-------|--------|
| **HEAD** | run `git log -1 --oneline` |
| **Branch** | run `git branch --show-current` (expect `main` for Stage 8) |
| **Working tree** | run `git status -sb` — clean before starting Stage 8 |
| **origin** | run `git status -sb` (likely ahead; push optional) |
| **Stages complete on `main`** | 0–7 (CLI + verify: manual arg parsing, file/dir/URL input, `-f docx\|odt`, `--outdir`, `--toc`, `--reference`, always-verify) |
| **Janus accepts** | Stages 3–6 — `docs/reviews/2026-07-20-stage-*.md` (Stage 7 not yet reviewed — ask Marcus to pull Janus in if a third-source accept is wanted) |
| **Next stage** | **8 Polish / edge-case hardening** `[antigravity]` |
| **Open P1 debt** | Nested list numbering (Stage 4) — leave unless assigned |
| **Open P2 (images)** | No local relative `src=` paths; 4:3 aspect fallback |

### Snapshot commands

```bash
cd /home/marcus/html-docx
git status -sb
git log -1 --oneline
npm test                # expect 54 tests (adds test/cli.test.js, 15 tests)
./scripts/verify.sh fixtures/images_full.html
node bin/cli.js fixtures/blocks_full.html -o /tmp/toc.docx --toc   # visual: TOC should show entries, not a blank gap
```

---

## Stage 7 note (Claude Code, 2026-07-20) — read before Stage 8

Implemented `bin/cli.js` (file/directory/URL input, `-f docx|odt` via `pandoc`, `--outdir`
batch mode, `--toc`, `--reference`, always-on LibreOffice PDF verify), `src/verify.js`
(new shared verify module), and extended `src/convert.js` for `toc`/`referenceStylesXml`.
Full rationale in BUILD_PLAN.md → Stage 7 deviations.

**Found + fixed via the LibreOffice PDF verify step itself** (not caught by unit tests):
`--toc` produced a structurally-correct TOC field (`w:sdt`, right instruction,
`updateFields` set) that rendered as a **blank gap** in the LibreOffice headless PDF —
LO never refreshes field-based TOCs in `--convert-to pdf`, only Word does that, on open.
Fixed by also populating `TableOfContents`'s `cachedEntries` (heading text + level,
collected from the DOM) so there's real static content for any non-refreshing viewer;
Word still recomputes the field (including real page numbers) on open. This is exactly
the kind of defect the DoD's "don't trust `npm test` alone for layout-sensitive work"
rule exists to catch — worth flagging since Stage 7 (CLI) isn't one of the DoD's
explicitly-named layout categories (blocks/lists/tables/images), but `--toc` clearly
qualifies and would have shipped broken on unit tests alone.

Always-verify is a **soft-fail default**: `verifyOutput()` always runs after every
write and prints PDF/JPEG paths, but a failure only warns rather than aborting the
command — requiring a working LibreOffice install for every `html2docx` invocation felt
wrong for a general-purpose CLI, as opposed to this repo's own dev-loop DoD. `--no-verify`
opts out; `--strict-raster` / `STRICT_RASTER=1` makes a missing `pdftoppm` fail instead
of warn (same convention as `scripts/verify.sh`).

Not requested from Janus for this stage — flag if a third-source accept is wanted before
Stage 8 relies on the CLI.

---

## Janus Stage 6 note (2026-07-20) — read before Stage 7

Antigravity shipped images (`3f9cb01`). Janus reviewed and found **P0**: remote `<img>` inside `<p>`/`li`/`td` lost prefetched buffers. Fixed options threading in `blocks.js` / `lists.js` / `tables.js`; added `testInlineRemoteImageUsesPrefetchBuffers`. Formal accept: [docs/reviews/2026-07-20-stage-6.md](./docs/reviews/2026-07-20-stage-6.md).

---

## Janus process work earlier (context for Claude Code / Gemini) — 2026-07-20

Marcus assigned Janus to fix process drift and leave implementers a clear trail. **Janus did not implement Stage 6/7 features** (except the Stage 6 options plumbing fix above).

### Problems found
1. HANDOFF claimed `main (clean state, all Stage 0-5 merged)` while tree had dirty `test/lists.test.js` and untracked Stage 5 review — classic doc/git split BUILD_PLAN was meant to prevent.
2. Stage 5 was marked `[x]` on tests + owner visual note **before** committed Janus accept; Marcus ruled tests ≠ done for shading/widths/colspan stages.
3. `testPostListElementsHaveNoNumbering` lived only in the working tree (lost on clean checkout).
4. `scripts/verify.sh` hard-failed on missing `pdftoppm` despite PDF step working.
5. Stale branch names: `stage-6` pointed at tables merge with no images work; `stage-5` tip behind merge (hygiene only — Janus may not delete branches unless asked).

### Actions taken by Janus
| Action | Detail |
|--------|--------|
| Formal Stage 5 review | ACCEPT after `npm test` + LO PDF on table fixtures + XML checks (CLEAR shade, DXA widths, vMerge/gridSpan). File: [docs/reviews/2026-07-20-stage-5.md](./docs/reviews/2026-07-20-stage-5.md) |
| Committed floating lists test | `testPostListElementsHaveNoNumbering` in `test/lists.test.js` |
| Definition of done | [BUILD_PLAN.md](./BUILD_PLAN.md) Coordination rules §4–8; [JANUS.md](./JANUS.md) DoD summary + new prompt blurb |
| HANDOFF rewrite | This file — git-truth table + Janus log (you are reading it) |
| `verify.sh` | PDF required; `pdftoppm` optional unless `STRICT_RASTER=1` |
| Did **not** | Push to origin; delete branches; start Stage 6/7 code; change `lists.js` / `tables.js` behavior |

### Visual artifacts (local, gitignored `out/`)
- `out/stage5-review/shaded.docx|pdf`, `merged.docx|pdf` — Janus LO run for Stage 5 accept  
- Re-run: `./scripts/verify.sh fixtures/table_shaded_header.html`

### What Claude should do next (if taking Stage 7) or Gemini (Stage 6)
1. `git pull` / `git status -sb` — start from clean `main` after Janus commit.
2. `git checkout -b stage-6` or `stage-7` from **current** `main` only.
3. Implement per BUILD_PLAN; do not rewrite list numbering unless Marcus assigns the P1.
4. End of stage: DoD checklist in BUILD_PLAN — including LO PDF for layout, HANDOFF table filled from **live** git, no “clean” fiction.
5. Request Janus review for layout-sensitive work when Marcus wants third-source accept.

---

## Technical Details (feature inventory — not a substitute for git)

### 1. Scaffold & verify host
- `bin/cli.js` — minimal `html2docx <in.html> -o out.docx`
- `scripts/office/soffice.py` — WSL → Windows LO via `/mnt/c/temp` copy-convert-move
- `scripts/verify.sh` — DOCX + PDF required; JPEG if `pdftoppm` present

### 2. Stage 1 — CSS (`src/style.js`)
Cascade, specificity, inheritance, em/rem/% → pt. Tests: `test/style.test.js`.

### 3. Stage 2 — Inline (`src/inline.js`, `src/color.js`)
TextRun / ExternalHyperlink; exports `BASE_PROPS`, `resolveRunProps`. Tests: `test/inline.test.js`.

### 4. Stage 3 — Blocks (`src/blocks.js`, wired `src/convert.js`)
h1–h6, p, blockquote, pre, hr; DOCTYPE text filter. Tests: `test/blocks.test.js`.  
Janus: [docs/reviews/2026-07-20-stage-3.md](./docs/reviews/2026-07-20-stage-3.md) ACCEPT.

### 5. Stage 4 — Lists (`src/lists.js`)
Real numbering configs on Document; ul/ol nest; continuation indent.  
**Known P1:** nested lists allocate **new** numId and elevated ilvl → nested `ol` often letters not 1/2/3 under parent.  
Janus: [docs/reviews/2026-07-20-stage-4.md](./docs/reviews/2026-07-20-stage-4.md) ACCEPT with P1.  
Tests: `test/lists.test.js` (includes post-list heading has no `numPr`).

### 5b. Stage 5 — Tables (`src/tables.js`)
Real `Table`; header `th`/`thead` bold+`CLEAR` `D9D9D9`; DXA 9000 split evenly across columns;
`colspan`/`rowspan` via docx's own auto-generated `vMerge` continuation cells (just tracks
which columns are already occupied). Cell content collapses to a single paragraph.
Janus: [docs/reviews/2026-07-20-stage-5.md](./docs/reviews/2026-07-20-stage-5.md) ACCEPT (unit + LO PDF).
Tests: `test/tables.test.js` (8). *(This entry was missing from a prior HANDOFF rewrite — restored per "git/BUILD_PLAN is ground truth.")*

### 6. Stage 6 — Images (`src/images.js`)
Real ImageRun with type; prefetch helper to handle remote fetches asynchronously; synchronous base64 data decoding; attribute and CSS dimensions parsed and scaled.
Tests: `test/images.test.js` (5, including the inline-remote-prefetch regression from the Janus Stage 6 fix above).

### 7. Stage 7 — CLI + verification loop (`bin/cli.js`, `src/verify.js`)
File/directory/URL input, `-f docx|odt` (odt via `pandoc`), `--outdir` batch mode, `--toc`
(real `TableOfContents` field + `cachedEntries` so it renders without a field refresh),
`--reference TEMPLATE` (merges the template's `word/styles.xml` via docx's `externalStyles`),
always-on LibreOffice PDF verify after every write (soft-fail by default, `--strict-raster`
to require `pdftoppm`, `--no-verify` to skip). See "Stage 7 note" above for the TOC bug
found via visual verify. Tests: `test/cli.test.js` (15).

### Not done
- Stage 8 polish (nested list fix, shorthands, etc.)


---

## Instructions for the next stage owner

### Stage 8 — Polish / edge-case hardening `[antigravity]`
1. Branch from latest `main`: `git checkout main && git pull` (if remote used) `&& git checkout -b stage-8`
2. Per BUILD_PLAN: empty elements, malformed/unclosed HTML, deeply nested spans, CSS
   shorthand (`font: bold 14px/1.4 sans-serif`), `--theme` CLI override flag.
3. The nested-list-numbering P1 (Stage 4 review) is a natural fit here if Marcus assigns
   it — new `numId` + elevated `ilvl` per nested list instead of reusing the parent's
   `numId` and just incrementing level.
4. Reuse `convertInline` / `cssColorToHex` / `resolveRunProps`+`BASE_PROPS`; register any
   new block handler in `BLOCK_HANDLERS` (`src/blocks.js`).
5. `npm test` + layout PDF via `./scripts/verify.sh fixtures/...` — **actually read the
   PDF**, not just check it was produced; Stage 7's TOC bug (see note above) only showed
   up visually, not in XML-presence checks.
6. Update BUILD_PLAN `[x]` + deviations; rewrite **Current Status** table from git; merge to `main`
7. Leave tree clean; link Janus review path if one was requested
