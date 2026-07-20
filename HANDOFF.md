# Handoff Note: html2docx

## Current Status
- **Completed Stages:** 
  - Stage 0 (Scaffold) `[x]`
  - Stage 1 (CSS cascade engine) `[x]`
- **Active Branch:** `main` (clean state, all Stage 0 & 1 changes merged)
- **Next Stage:** **Stage 2 — Inline run formatting** (owned by `[claude-code]`)

---

## Technical Details

### 1. Structure Created (Stage 0)
- All stub JS modules are created in `src/`.
- `bin/cli.js` acts as the command-line entry point.
- `scripts/verify.sh` runs the E2E verification (translating HTML -> DOCX buffer -> PDF via LibreOffice -> JPEG via pdftoppm).
  - *Note on host environment:* LibreOffice (`soffice`) and `pdftoppm` are not currently installed on the host. `scripts/verify.sh` is written to catch this and log a helpful reminder, whilst still successfully executing Step 1 (HTML -> DOCX).

### 2. CSS Engine Implemented (Stage 1)
- **File:** [src/style.js](file:///home/marcus/html-docx/src/style.js)
- **Functions:**
  - `applyStylesToTree(rootNode, defaultRootFontSize)`: Walks the DOM tree and resolves/attaches computed styles to all element nodes in `node.computedStyle`.
  - Supports: tag, `.class`, `#id`, `tag.class`, `tag#id`, and `*` selectors.
  - Calculates specificity: ID = 100, Class = 10, Tag = 1.
  - Inherits specific properties down the DOM stack: `color`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-decoration`.
  - Resolves absolute/relative font sizes (`px`, `pt`, `em`, `rem`, `%`) to standard `pt` values (e.g., `18pt`).
- **Tests:** `npm test` runs a full suite of CSS resolution tests in [test/style.test.js](file:///home/marcus/html-docx/test/style.test.js). All tests are currently passing.

---

## Instructions for `[claude-code]` (Stage 2)
1. **Branch out:** Create and switch to a new branch `stage-2` (`git checkout -b stage-2`).
2. **Implementation target:** Implement `src/inline.js`. Given an inline-level DOM node and its computed style (found at `node.computedStyle`), parse it and produce `docx` `TextRun` and `ExternalHyperlink` objects.
   - Use the resolved style properties on the node (such as converting font-weight >= 600 or "bold" to `bold: true`, etc.).
3. **Verify:** Write test fixtures (e.g., in `fixtures/`) for your formatted text, code blocks, links, and nested formatting, then run/extend the tests.
4. **Update files:** Upon completion of Stage 2:
   - Update the status in [BUILD_PLAN.md](file:///home/marcus/html-docx/BUILD_PLAN.md).
   - Update this `HANDOFF.md` file to reflect progress.
   - Merge `stage-2` into `main` after verifying.
