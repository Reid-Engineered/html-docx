# Architecture — html2docx

```
HTML string
    │
    ▼
parse.js          node-html-parser → DOM tree
    │
    ▼
style.js          collect <style> rules → cascade + inheritance
                  attach node.computedStyle on every element
    │
    ├──────────────┬──────────────┬─────────────┬─────────────┐
    ▼              ▼              ▼             ▼             ▼
inline.js       blocks.js      lists.js     tables.js     images.js
TextRun /       Heading /      numbering    Table/Row/    ImageRun
Hyperlink       Paragraph      config       Cell
    │              │              │             │             │
    └──────────────┴──────────────┴─────────────┴─────────────┘
                           │
                           ▼
                     convert.js   Document + sections
                           │
                           ▼
                     Packer.toBuffer → .docx
                           │
              (optional) verify.sh → LO PDF → pdftoppm JPEG
```

## Module contracts (intended)

| Module | Input | Output |
|--------|-------|--------|
| `parseHtml(html)` | string | root DOM node |
| `applyStylesToTree(root)` | DOM | mutates `node.computedStyle` |
| `convertInline(node, style?)` | inline DOM | `TextRun[]` / `ExternalHyperlink[]` |
| `convertBlock(node)` | block DOM | docx block children |
| `convertList(node)` | ul/ol | paragraphs + numbering refs |
| `convertTable(node)` | table | `Table` |
| `convertImage(node)` | img | `ImageRun[]` |
| `convertHtmlToDocx(html, opts)` | string | `Buffer` |

## Style model

- Specificity (Stage 1): ID 100, class 10, tag 1; equal spec → later rule wins.
- Inline `style=""` wins over stylesheet rules.
- Inherited: `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-decoration`.
- Font sizes normalized to `pt` strings on `computedStyle` before inline mapping (half-points for docx).

## Non-goals (by design)

- CSS grid / absolute / fixed / multi-column / overlap
- JS-rendered DOM
- Auto `@font-face` embed
- Pixel parity with browser paint

## Host tooling (WSL)

- Node 18+ / npm (project deps: `docx`, `node-html-parser`)
- LibreOffice: Windows install at `C:\Program Files\LibreOffice\program\soffice.exe` (not currently on WSL PATH as `soffice`)
- `pdftoppm` (poppler-utils) — may be missing until installed
- See `docs/VERIFY.md`
