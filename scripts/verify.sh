#!/bin/bash
# HTML → DOCX → PDF → (optional) JPEG raster
# Exit codes: 0 = full success or intentional PDF-only success
#             1 = convert/PDF failure
#             2 = usage / missing input
set -euo pipefail

FIXTURE=${1:-fixtures/simple.html}
OUTPUT_DIR=${OUTPUT_DIR:-out}
STRICT_RASTER=${STRICT_RASTER:-0}   # set 1 to fail if pdftoppm missing
mkdir -p "$OUTPUT_DIR"

if [[ ! -f "$FIXTURE" ]]; then
  echo "Error: fixture not found: $FIXTURE" >&2
  exit 2
fi

echo "=== Step 1: Converting HTML to DOCX ==="
node bin/cli.js "$FIXTURE" -o "$OUTPUT_DIR/output.docx"

echo "=== Step 2: Converting DOCX to PDF (LibreOffice) ==="
python3 scripts/office/soffice.py --headless --convert-to pdf --outdir "$OUTPUT_DIR" "$OUTPUT_DIR/output.docx"

if [[ ! -f "$OUTPUT_DIR/output.pdf" ]]; then
  echo "Error: expected $OUTPUT_DIR/output.pdf after LibreOffice convert" >&2
  exit 1
fi

echo "=== Step 3: Rasterizing PDF to Images (optional) ==="
if command -v pdftoppm >/dev/null 2>&1; then
  pdftoppm -jpeg -r 100 "$OUTPUT_DIR/output.pdf" "$OUTPUT_DIR/page"
  echo "Raster OK: $OUTPUT_DIR/page*.jpg"
else
  msg="pdftoppm not on PATH — skipped JPEG raster (PDF is at $OUTPUT_DIR/output.pdf). Install poppler-utils or set STRICT_RASTER=1 to fail."
  if [[ "$STRICT_RASTER" == "1" ]]; then
    echo "Error: $msg" >&2
    exit 1
  fi
  echo "WARN: $msg"
fi

echo "=== Verification complete ==="
ls -la "$OUTPUT_DIR/"
