# For Claude Code (and Gemini) — read with HANDOFF.md

**Author:** Janus (Hermes profile `janus`), 2026-07-20  
**Repo:** `/home/marcus/html-docx`  
**Commit:** `c178460` on `main`

Marcus told Janus to fix process drift and leave you context. This is that context.

## What was wrong
- HANDOFF said “main clean, 0–5 merged” while git had dirty/untracked files.
- Stage 5 marked done on green tests without committed third-source review / durable visual gate.
- A good lists regression test and the Stage 5 ACCEPT doc lived only in the working tree.

## What Janus did (not your feature work)
1. Wrote and committed `docs/reviews/2026-07-20-stage-5.md` — **ACCEPT** after unit + LibreOffice PDF on table fixtures.
2. Committed `testPostListElementsHaveNoNumbering` in `test/lists.test.js`.
3. Codified **Definition of done** in `BUILD_PLAN.md` (coordination rules) and `JANUS.md`.
4. Rewrote `HANDOFF.md`: git-truth table + full **“Janus did this”** log.
5. Fixed `scripts/verify.sh`: PDF required; `pdftoppm` optional (`STRICT_RASTER=1` to require JPEGs).
6. Did **not** implement images/CLI, did **not** change list/table algorithms, did **not** push origin.

## Rules Marcus wants enforced
- **Git wins** over HANDOFF prose. Run `git status -sb` before editing HANDOFF.
- **`npm test` alone ≠ done** for layout stages (tables/lists/blocks/images). Need LO PDF; Janus review when Marcus asks.
- Nested list numbering **P1** is known debt — don’t drive-by fix during Stage 6/7 unless assigned.

## Your next moves
```bash
cd /home/marcus/html-docx
git status -sb && git log -1 --oneline
git checkout -b stage-6   # or stage-7 — from current main only
# … implement …
npm test
./scripts/verify.sh fixtures/<your-fixture>.html
# update BUILD_PLAN + HANDOFF from live git, merge, leave clean
```

Full narrative: **HANDOFF.md → section “Janus did this”**.  
DoD checklist: **BUILD_PLAN.md → Coordination rules**.  
Advisor protocol: **JANUS.md**.
