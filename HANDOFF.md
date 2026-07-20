# Handoff Note: html2docx

**Agents:** read [JANUS.md](./JANUS.md) + [BUILD_PLAN.md](./BUILD_PLAN.md) at session start.  
**Git is ground truth.** Before editing this file, run `git status -sb` and `git log -1 --oneline`. Never claim “clean” or “merged” unless those agree.

---

## Current Status (authoritative — update every session end)

> **Regenerate this block from git, do not prose-edit from memory.**

| Field | Value |
|-------|--------|
| **HEAD** | `3439a77 docs: align HANDOFF HEAD with FOR_CLAUDE commit` |
| **Branch** | `main` |
| **Working tree** | clean (verify: `git status -sb`) |
| **origin** | **ahead of `origin/main` by 10** — push optional |
| **Stages complete on `main`** | 0–5 code merged (`be90c73` tables merge + `c178460` process) |
| **Janus accepts** | Stage 3, 4, 5 — `docs/reviews/2026-07-20-stage-*.md` (5 committed in `c178460`) |
| **Next stage** | **6 Images** `[antigravity]` and/or **7 CLI+verify** `[claude-code]` (parallel OK) |
| **Open P1 debt** | Nested list numbering (Stage 4 review) — do not “fix” mid–Stage 6/7 unless assigned |

### Snapshot at last Janus process fix (2026-07-20)

```bash
cd /home/marcus/html-docx
git status -sb          # expect: main, clean, ahead of origin by 8+
git log -1 --oneline    # expect: 3439a77 ...
npm test                # expect: 34 tests, all pass
./scripts/verify.sh fixtures/simple.html   # PDF OK; pdftoppm may WARN skip
```

Expected after process series (`c178460`..`3439a77`):
- Branch `main`, tree **clean**
- Stages 0–5 on history through `be90c73` + process commit `c178460`
- `npm test` — style 6 + inline 8 + blocks 8 + lists **4** + tables 8 = **34** tests
---

## Janus did this (context for Claude Code / Gemini) — 2026-07-20

Marcus assigned Janus to fix process drift and leave implementers a clear trail. **Janus did not implement Stage 6/7 features.**

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

### 6. Stage 5 — Tables (`src/tables.js`)
Real Table; header th/thead bold+CLEAR `D9D9D9`; DXA 9000 equal cols; colspan/rowspan.  
Janus: [docs/reviews/2026-07-20-stage-5.md](./docs/reviews/2026-07-20-stage-5.md) ACCEPT (unit + LO PDF).  
Tests: `test/tables.test.js` (8).

### Not done
- Stage 6 `src/images.js` — stub `return []`
- Stage 7 full CLI (batch, URL, toc, reference, odt, always-verify)
- Stage 8 polish (nested list fix, shorthands, etc.)

---

## Instructions for the next stage owner

1. Branch from latest `main`: `git checkout main && git pull` (if remote used) `&& git checkout -b stage-N`
2. Implement BUILD_PLAN stage N only
3. Reuse `convertInline` / `cssColorToHex` / `resolveRunProps`+`BASE_PROPS`; register handlers in `BLOCK_HANDLERS`
4. `npm test` + layout PDF via `./scripts/verify.sh fixtures/...`
5. Update BUILD_PLAN `[x]` + deviations; rewrite **Current Status** table from git; merge to `main`
6. Leave tree clean; link Janus review path if one was requested
