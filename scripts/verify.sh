#!/bin/bash
set -e

# Usage: ./scripts/verify.sh [fixture_path]
FIXTURE=${1:-fixtures/simple.html}
OUTPUT_DIR="out"
mkdir -p "$OUTPUT_DIR"

echo "=== Step 1: Converting HTML to DOCX ==="
node bin/cli.js "$FIXTURE" -o "$OUTPUT_DIR/output.docx"

echo "=== Step 2: Converting DOCX to PDF ==="
python3 scripts/office/soffice.py --headless --convert-to pdf --outdir "$OUTPUT_DIR" "$OUTPUT_DIR/output.docx"

echo "=== Step 3: Rasterizing PDF to Images ==="
pdftoppm -jpeg -r 100 "$OUTPUT_DIR/output.pdf" "$OUTPUT_DIR/page"

echo "=== Verification complete! ==="
echo "Output files are located in: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR/"
