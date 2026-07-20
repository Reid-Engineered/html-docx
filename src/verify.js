import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOFFICE_WRAPPER = path.join(__dirname, '..', 'scripts', 'office', 'soffice.py');

/**
 * Converts an already-written docx/odt file to PDF via the LibreOffice
 * wrapper (handles the WSL Windows-soffice.exe workaround itself), then
 * optionally rasterizes to JPEG with `pdftoppm` for visual inspection.
 * Mirrors `scripts/verify.sh`'s soft-fail behavior: a missing `pdftoppm`
 * only produces a warning unless `strictRaster` is set, since the PDF
 * alone is enough to eyeball layout (and is directly readable by tools
 * that can open PDFs).
 * @param {string} outputPath Path to the docx/odt file to verify.
 * @param {Object} [options]
 * @param {boolean} [options.strictRaster] Fail if `pdftoppm` isn't available.
 * @returns {Promise<{ pdfPath: string|null, jpegPaths: string[], warnings: string[] }>}
 */
export async function verifyOutput(outputPath, options = {}) {
  const strictRaster = options.strictRaster || process.env.STRICT_RASTER === '1';
  const warnings = [];
  const outdir = path.dirname(path.resolve(outputPath));
  const baseName = path.basename(outputPath, path.extname(outputPath));
  const expectedPdfPath = path.join(outdir, `${baseName}.pdf`);

  try {
    await execFileAsync('python3', [
      SOFFICE_WRAPPER, '--headless', '--convert-to', 'pdf', '--outdir', outdir, outputPath
    ]);
  } catch (err) {
    throw new Error(`LibreOffice PDF conversion failed for ${outputPath}: ${err.message}`);
  }

  if (!fs.existsSync(expectedPdfPath)) {
    throw new Error(`LibreOffice reported success but ${expectedPdfPath} was not created`);
  }

  let jpegPaths = [];
  try {
    const rasterPrefix = path.join(outdir, `${baseName}-page`);
    await execFileAsync('pdftoppm', ['-jpeg', '-r', '100', expectedPdfPath, rasterPrefix]);
    jpegPaths = fs.readdirSync(outdir)
      .filter(f => f.startsWith(`${baseName}-page`) && f.endsWith('.jpg'))
      .sort()
      .map(f => path.join(outdir, f));
  } catch (err) {
    const msg = `pdftoppm unavailable or failed — PDF is at ${expectedPdfPath}, no JPEG raster (${err.message})`;
    if (strictRaster) throw new Error(msg);
    warnings.push(msg);
  }

  return { pdfPath: expectedPdfPath, jpegPaths, warnings };
}
