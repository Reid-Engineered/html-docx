# JANUS.md — Advisor / third source of truth

**Who:** Janus — Marcus’s IT / systems agent (Hermes profile `janus`).  
**Where this file lives:** repo root — **read it at session start** with `BUILD_PLAN.md` and `HANDOFF.md`.  
**Last updated:** 2026-07-20

---

## Why Janus exists on this repo

Claude Code and Gemini (Antigravity) **implement stages**.  
Janus does **not** replace them. Janus is a **third source of truth** for:

- architecture and scope honesty (docx ≠ pixel-PDF)
- host/ops reality (WSL, LibreOffice paths, verify pipeline)
- multi-agent process drift (stale HANDOFF, half-merged stages)
- documentation hygiene
- review of risky designs before they become debt

If BUILD_PLAN and a chat transcript disagree, prefer **BUILD_PLAN → this file’s process rules → HANDOFF → chat**.

---

## When you must consult Janus (via Marcus or docs)

Implementers should **stop and check** (read `docs/JANUS_REVIEW.md` + this file, or ask Marcus to pull Janus in) when:

1. Changing the **module contract** (`parse` → `style` → `inline`/`blocks`/`lists`/`tables`/`images` → `convert`)
2. Expanding **CSS support** beyond BUILD_PLAN (combinators, shorthands, `@media`, etc.)
3. Touching **`scripts/verify.sh`**, `scripts/office/*`, or assuming Linux `soffice` / `pdftoppm` on PATH
4. Claiming **pixel-perfect** or “matches browser/PDF” as a stage success criterion
5. Adding **network fetch**, new npm deps with broad install surface, or Docker services
6. Rewriting **coordination rules** or owning someone else’s in-progress stage
7. Targeting **DocComponents / `.dc.html` / OA-450 manual** without a preprocess design
8. Marking a stage `[x]` when tests or wiring are still missing

Routine stage coding inside an owned stage does **not** require Janus.

---

## What Janus will / will not do

| Janus will | Janus will not (default) |
|------------|---------------------------|
| Review PRs/diffs and file written findings | Silently take over your stage mid-flight |
| Own / fix **host verify** (LO wrapper, poppler, paths) | Implement Stage 2–5 feature code unless Marcus reassigns |
| Keep `docs/` + root README accurate | Be a second implementer “just to go faster” |
| Audit BUILD_PLAN ↔ HANDOFF ↔ git reality | Print secrets or bypass safety tiers |
| Advise on CI gates (unit vs XML vs screenshot) | Approve pixel-fidelity as docx scope |

**Owner keys (extended):**

| Tag | Meaning |
|-----|---------|
| `[claude-code]` | Stage implementer |
| `[antigravity]` / Gemini | Stage implementer |
| `[either]` | Whichever implementer starts the stage |
| `[janus]` | Advisor / ops / docs / verify host — not default feature owner |
| `[janus+implementer]` | Janus designs or reviews; implementer codes |

---

## How to use Janus’s advice

1. **Before a stage:** skim `docs/ARCHITECTURE.md` + latest `docs/JANUS_REVIEW.md` (and dated follow-ups under `docs/reviews/` if present).
2. **During a stage:** if you hit a P0/P1 from the review, fix or document a deviation in BUILD_PLAN — don’t bury it.
3. **After a stage:** update BUILD_PLAN + HANDOFF; optionally ask Marcus for a Janus pass before merge to `main`.
4. **Disagreement:** note it under **Deviations from plan** in BUILD_PLAN with one line: what Janus advised vs what you did and why.

Janus advice is **normative for process and host facts**. On pure product/API taste inside an owned stage, the **stage owner decides**, then records deviations.

---

## Canonical doc map

| Path | Role |
|------|------|
| [BUILD_PLAN.md](./BUILD_PLAN.md) | Stage board — status ground truth for implementation |
| [HANDOFF.md](./HANDOFF.md) | Next agent’s live instructions |
| [JANUS.md](./JANUS.md) | **This file** — how to treat Janus |
| [README.md](./README.md) | Human/entry overview |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Pipeline + module contracts |
| [docs/JANUS_REVIEW.md](./docs/JANUS_REVIEW.md) | Standing third-source review (problems, ideas) |
| [docs/REFERENCE.md](./docs/REFERENCE.md) | DevDocs, docx, CSS specs |
| [docs/VERIFY.md](./docs/VERIFY.md) | LibreOffice / pdftoppm host reality |
| [docs/reviews/](./docs/reviews/) | Dated stage reviews (e.g. Stage 3 accept) |

---

## Standing technical positions (don’t relitigate every session)

1. **Goal:** native Word structure and survivable style — not browser paint parity.  
2. **PDF via LibreOffice** is the layout regression aid for stages 3+; not browser pixel parity.  
3. **Unit tests + docx XML assertions** always; **LO PDF** required for blocks/lists/tables/images before `[x]` when host can run soffice.  
4. **One stage → one implementer → DoD → merge → HANDOFF matches git.**  
5. **WSL host:** use `scripts/office/soffice.py` (Windows LO + `/mnt/c/temp`). `pdftoppm` optional (`STRICT_RASTER=1` to require it).  
6. **Git wins** over HANDOFF/BUILD_PLAN prose when they disagree — fix docs same session.  
7. Nested list numbering P1 remains open (see Stage 4 review): new numId + elevated ilvl.  
8. Stage 5 Janus-accepted 2026-07-20 (`docs/reviews/2026-07-20-stage-5.md`).

## Definition of done (summary)

See full checklist in `BUILD_PLAN.md` → Coordination rules. Short form:

`code + npm test + merge to main + (layout? LO PDF) + (Janus review if required) + HANDOFF == git status`

**Never** mark `[x]` or “main clean / merged” from memory.

---

## Prompt blurb (paste into Claude Code / Gemini)

```text
This repo is html2docx. Read BUILD_PLAN.md, HANDOFF.md, and JANUS.md before coding.
Git is ground truth — run git status -sb and git log -1 before editing HANDOFF.
Janus is third-source advisor. Stage reviews: docs/reviews/. DoD in BUILD_PLAN coordination rules.
Do not mark a stage [x] on tests alone if it touches tables/lists/layout — need LO PDF + review when required.
Pixel-perfect HTML→DOCX is out of scope. Prefer native docx objects + tests.
After your stage: update BUILD_PLAN + HANDOFF from live git, commit review artifacts, leave tree clean.
```

---

## Contact path

There is no autonomous Janus webhook in-repo. Marcus runs the Janus Hermes profile and can:

- request a **review pass** (diff / stage gate)
- assign **`[janus]`** work (verify wrapper, docs)
- reassign a stage only by explicit note in HANDOFF + BUILD_PLAN

If this file conflicts with a newer Marcus instruction in HANDOFF, **HANDOFF wins for “what next”**, and BUILD_PLAN wins for **stage status** after the agent updates it.
