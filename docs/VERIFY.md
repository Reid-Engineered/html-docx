# Verification pipeline (host)

## Intended flow

```bash
./scripts/verify.sh [fixture.html]
# 1) node bin/cli.js → out/output.docx
# 2) LibreOffice headless → out/output.pdf
# 3) pdftoppm → out/page-1.jpg …
```

## Current host status (Marcus-Laptop WSL, 2026-07-20)

| Tool | Status |
|------|--------|
| Node / npm test | OK |
| `soffice` on WSL PATH | Missing |
| Windows LibreOffice | Present: `/mnt/c/Program Files/LibreOffice/program/soffice.exe` |
| `pdftoppm` | Not confirmed — install `poppler-utils` if missing |
| `scripts/office/soffice.py` | Calls `soffice` only — needs WSL wrapper |

## Recommended wrapper behavior

1. Resolve binary:
   - `SOFFICE_BIN` env if set  
   - `command -v soffice`  
   - fallback Windows path above  
2. Prefer writing outputs under a Windows-visible path (`/mnt/c/Users/marcu/...`) **or** convert using paths LO accepts (avoid double-mapped `/mnt/c/mnt/c/...` bugs when invoking `.exe` from WSL).
3. If LO unavailable: exit 0 with `VERIFY_SKIP_PDF=1` for CI unit stages; exit 2 if `--strict`.

## Unit vs visual

| Gate | When |
|------|------|
| `npm test` | Every commit |
| Unzip docx XML asserts | Stage 2+ |
| LO + pdftoppm screenshots | Stage 3+ and release candidates |

Do not block Stage 1–2 merges on screenshots while host PDF path is unfinished.
