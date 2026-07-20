# Janus review — third source of truth

**Date:** 2026-07-20  
**Repo:** `/home/marcus/html-docx`  
**Branch at review:** `stage-2` (dirty: `src/inline.js`, untracked `src/color.js`)  
**Role:** ops + architecture review + documentation — not Stage-2 owner unless asked

---

## Snapshot

| Item | Finding |
|------|---------|
| Stage 0–1 | Solid. Tests green (6/6 style tests). |
| Stage 2 | Implementation largely present in working tree; **not wired** into `convert.js`; **no unit tests** yet; HANDOFF still says Stage 2 not started (stale vs disk). |
| Pipeline | CLI writes empty docx (convert stub). verify.sh will not prove styling until Stage 3 wires children. |
| Host verify | `scripts/office/soffice.py` calls bare `soffice` — **fails on this WSL host**. Windows LO exists but path not used. `pdftoppm` not confirmed installed. |

---

## Problems (ordered by severity)

### P0 — Stage 2 incomplete integration
`convert.js` still builds `children: []`. Even a perfect `inline.js` cannot affect output until Stage 3 (or a thin Stage-2 spike) emits paragraphs.

### P0 — Hyperlink option smuggling is broken
`collectRuns` maps children through `extractRunOptions(child)`, which reads `textRun.__html2docxOptions`, but **nothing ever sets that field** when constructing `TextRun`. Hyperlink restyle path silently drops bold/color/size.

Fix direction: either  
(a) attach `__html2docxOptions` in a small `makeTextRun(options)` helper used everywhere, or  
(b) stop rebuilding runs and pass already-built `TextRun` children (docx ExternalHyperlink accepts TextRun children with formatting already applied).

Also: `convertInline` top-level `<a>` path does **not** apply `style: 'Hyperlink'`, while nested path in `collectRuns` tries to — inconsistent.

### P1 — Docs drift
- HANDOFF says Stage 2 not started; disk has ~240 lines of `inline.js` + full `color.js`.
- BUILD_PLAN Stage 2 still `[ ]`.
- Agents will thrash without a single “current truth” update after every session.

### P1 — Verify pipeline host gap
```
scripts/office/soffice.py → subprocess(["soffice", ...])  # not on PATH
```
WSL reality: LO is Windows-side. Need a wrapper that prefers:
1. `soffice` on PATH  
2. `/mnt/c/Program Files/LibreOffice/program/soffice.exe` with Windows outdir paths  
3. clear skip + non-zero only if `--strict`

BUILD_PLAN also shows `python scripts/office/soffice.py` while verify.sh uses `python3` — minor.

### P2 — CSS engine limits (known, flag before Stage 5–8)
- No combinators: `div p`, `>`, `+`, `~`
- No attribute selectors
- No pseudo-classes (`:hover` N/A, but `:first-child` matters for tables)
- No shorthand expansion (`font:`, `margin:`, `border:`)
- `text-decoration` inherited as a whole — browser behavior is more nuanced
- `background-color` used in inline.js but **not** in INHERITABLE list (correct — not inherited) and **not** resolved by cascade for non-inline unless inline style/class sets it on that node — OK if stylesheet rules include it in cascade merge (confirm style.js copies all declared props, not only inheritable)

### P2 — Whitespace
`node.text.replace(/\s+/g, ' ')` collapses all whitespace always. Will mangle `pre`/`code` blocks when Stage 3 lands unless `white-space` / tag checks skip collapse.

### P2 — rgb() modern syntax
`color.js` only splits on commas. CSS Color 4 `rgb(255 0 0 / 0.5)` fails → null color.

### P3 — Coordination risk (3 agents)
BUILD_PLAN says never split a stage. With Gemini + Claude Code + Janus:
- Janus should **review and document**, not silently restyle Stage-2 code mid-flight.
- Prefer Janus owning: host verify, docs, architecture gates, fixture policy, release CLI (Stage 7 assist).

---

## Ideas (product / eng)

1. **Golden fixture set** under `fixtures/` with a matrix README (feature → file → stage). One fixture per claim; forbid kitchen-sink until Stage 8.
2. **Unit tests before visual** for Stage 2: assert `TextRun` options via a test helper that calls `convertInline` on minimal HTML after `applyStylesToTree`. Do not wait for LO screenshots.
3. **Contract test**: pack a tiny docx, unzip `word/document.xml`, grep for `w:b`, `w:color`, `w:hyperlink` — CI-friendly without LO.
4. **Reference doc path early** (`--reference`): brand template for ODL manuals later; cheaper than fighting default Normal style.
5. **ODT**: Stage 7 pandoc fallback is fine; do not build a second native emitter.
6. **DocComponents / `.dc.html`**: out of scope until a preprocess step strips custom elements + expands `sc-for`. Keep as separate `fixtures/future/` note so nobody claims OA-450 manual works on Stage 3.
7. **Parallel Stage 6 (images)** is correctly marked independent — good throughput if Gemini takes it while Claude does 2→3.
8. **Accept “native structure > chrome”** as the public tagline; link pixel-PDF path to a different tool (Playwright) so expectations stay honest.

---

## Janus proposed ownership

| Work | Janus? |
|------|--------|
| Stage 2 finish (inline tests, hyperlink fix) | Only if Marcus assigns; else review-only |
| WSL LO + pdftoppm verify path | Yes |
| docs/ + README hygiene | Yes |
| BUILD_PLAN/HANDOFF consistency audits | Yes (after each stage merge) |
| Fixture policy / architecture gates | Yes |
| Pixel PDF pipeline for manuals | Separate project; not html2docx |

---

## Immediate checklist (for whoever owns Stage 2)

- [ ] Fix TextRun option round-trip / hyperlink children
- [ ] Add `test/inline.test.js` + fixtures for nested bold-link-color
- [ ] Export + use `cssColorToHex` tests (hex3/hex8/rgb/named/transparent)
- [ ] Update BUILD_PLAN Stage 2 `[~]` or `[x]` + HANDOFF
- [ ] Do not mark Stage 2 done until tests pass; wiring into convert can be Stage 3 if paragraphs are required

---

## Sign-off stance

Architecture direction is **correct** (cascade → native docx modules → optional raster verify). Biggest risk is **process drift + host verify fiction + hyperlink bug**, not the overall plan.
