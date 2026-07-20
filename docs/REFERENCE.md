# External references

## DevDocs (API browser — not project docs)

[DevDocs](https://devdocs.io/) is an **offline-capable browser for official platform docs** (HTML, CSS, JavaScript, Node, etc.). It is **not** a host for *this* repo’s documentation.

### Use it for html2docx

Enable offline sets that match the cascade/inline work:

| Doc set | Why |
|---------|-----|
| CSS | cascade, specificity, inheritance, font-size, colors |
| HTML | phrasing vs flow content, `a`, lists, tables |
| JavaScript | ES modules if needed |
| Node | fs / path / test runners later |

Online: open https://devdocs.io/ → Enable → select docs → install for offline.

### Self-host (optional)

Upstream: https://github.com/freeCodeCamp/devdocs  

Docker community images exist (search `devdocs` on Docker Hub). Treat as **read-only reference** on laptop/orion — no secrets, no inbound exposure required if localhost-only.

Suggested (Tier 2 if publishing beyond localhost):

```bash
# example only — pin a known image after review
docker run -d --name devdocs -p 127.0.0.1:9292:9292 ghcr.io/freecodecamp/devdocs:latest
```

Then browse `http://127.0.0.1:9292`.

### What DevDocs will not do

- Host BUILD_PLAN / architecture / ODL manual content  
- Replace README or `docs/`  
- Document the `docx` npm package (not in DevDocs catalog)

For **project** docs keep Markdown in-repo (this `docs/` tree). Optional later: VitePress/MkDocs static site generated from `docs/`.

## docx (npm)

- Package: https://www.npmjs.com/package/docx  
- In use: `^9.7.1`  
- Critical gotchas already in BUILD_PLAN: `ShadingType.CLEAR` not `SOLID`; table widths in DXA on table **and** cells; `TextRun.shading` for code chips.

## node-html-parser

- https://github.com/taoqf/node-html-parser  
- Tolerates messy HTML; does not run JS or apply browser layout.

## Spec anchors (for cascade fidelity debates)

- CSS Cascading and Inheritance: https://www.w3.org/TR/css-cascade-4/  
- CSS Color: https://www.w3.org/TR/css-color-4/  
- Selectors: https://www.w3.org/TR/selectors-4/  

Prefer DevDocs CSS pages for day-to-day; TR for edge-case arbitration.
