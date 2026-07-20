# html2docx

Convert real HTML/CSS into **native Word objects** (headings, lists, tables, runs, hyperlinks) — not a pandoc-style generic dump.

Pixel-perfect layout is **out of scope** (that is a PDF/browser problem). Surviving flow-document styling is in scope.

## Status

See [BUILD_PLAN.md](./BUILD_PLAN.md) (stage board) and [HANDOFF.md](./HANDOFF.md) (active agent notes).

| Stage | What | Status |
|------:|------|--------|
| 0 | Scaffold | done |
| 1 | CSS cascade (`style.js`) | done + tests |
| 2 | Inline runs (`inline.js`) | in progress (`stage-2`) |
| 3–8 | Blocks, lists, tables, images, CLI, polish | pending |

## Quick start

```bash
cd ~/html-docx
npm test
node bin/cli.js fixtures/simple.html -o out/output.docx
```

Visual verify (needs LibreOffice + poppler on PATH — see docs):

```bash
./scripts/verify.sh fixtures/simple.html
```

## Docs

| Doc | Audience |
|-----|----------|
| [BUILD_PLAN.md](./BUILD_PLAN.md) | Stage owners (Claude Code / Gemini / Antigravity) |
| [HANDOFF.md](./HANDOFF.md) | Next-agent instructions |
| [JANUS.md](./JANUS.md) | **Advisor reference** — how Claude/Gemini use Janus |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Module map + data flow |
| [docs/JANUS_REVIEW.md](./docs/JANUS_REVIEW.md) | Third-source review (ops + risks + ideas) |
| [docs/REFERENCE.md](./docs/REFERENCE.md) | External refs (DevDocs, docx API, CSS) |
| [docs/VERIFY.md](./docs/VERIFY.md) | Host verify pipeline (LO + pdftoppm) |

## Agent roles

| Role | Owner |
|------|--------|
| Stage implementation | Claude Code or Gemini/Antigravity per BUILD_PLAN |
| Third source of truth / review / host tooling / docs hygiene | **Janus** — see **[JANUS.md](./JANUS.md)** |

Rules: one stage → one owner → update BUILD_PLAN + HANDOFF on finish. Janus does not mid-stage rewrite owned code unless Marcus asks for a review fix.
