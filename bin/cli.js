#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { convertHtmlToDocx } from '../src/convert.js';
import { verifyOutput } from '../src/verify.js';

const execFileAsync = promisify(execFile);

const HELP_TEXT = `html2docx <input> [options]

<input>  HTML file path, directory of .html/.htm files, or an http(s):// URL

Options:
  -o, --output <path>      Output file path (single file/URL input only)
  -f, --format <docx|odt>  Output format (default: docx; odt via pandoc)
  --outdir <dir>           Output directory (required for a directory input;
                            optional destination for a single file/URL)
  --toc                    Insert a Table of Contents built from h1-h6
  --theme <theme>          Force a theme override (modern, classic, dark, creative)
  --reference <template>   Merge paragraph/character styles from a
                            reference .docx (pandoc reference-doc pattern)
  --no-verify              Skip the post-conversion LibreOffice PDF check
  --strict-raster          Fail if pdftoppm JPEG rasterization is
                            unavailable (default: warn only, PDF still checked)
  -h, --help                Show this help
`;

/**
 * @param {string[]} argv
 * @returns {Object}
 */
export function parseArgs(argv) {
  const options = {
    input: null,
    output: null,
    format: 'docx',
    outdir: null,
    toc: false,
    theme: null,
    reference: null,
    verify: true,
    strictRaster: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-o':
      case '--output':
        options.output = argv[++i];
        break;
      case '-f':
      case '--format':
        options.format = argv[++i];
        break;
      case '--outdir':
        options.outdir = argv[++i];
        break;
      case '--toc':
        options.toc = true;
        break;
      case '--reference':
        options.reference = argv[++i];
        break;
      case '--no-verify':
        options.verify = false;
        break;
      case '--strict-raster':
        options.strictRaster = true;
        break;
      case '--theme':
        options.theme = argv[++i];
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        if (options.input === null) {
          options.input = arg;
        } else {
          throw new Error(`Unexpected argument: ${arg}`);
        }
    }
  }

  return options;
}

/**
 * @param {string} input
 * @returns {'url'|'directory'|'file'}
 */
export function classifyInput(input) {
  if (/^https?:\/\//i.test(input)) return 'url';
  if (fs.existsSync(input) && fs.statSync(input).isDirectory()) return 'directory';
  return 'file';
}

/**
 * @param {string} baseName Output file name without extension.
 * @param {{ output?: string, outdir?: string, format: string }} opts
 * @returns {string}
 */
export function resolveOutputPath(baseName, { output, outdir, format }) {
  if (output) return output;
  const ext = format === 'odt' ? '.odt' : '.docx';
  const fileName = `${baseName}${ext}`;
  return outdir ? path.join(outdir, fileName) : fileName;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function baseNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (last) {
      const stem = path.basename(last, path.extname(last));
      if (stem) return stem;
    }
  } catch {
    // fall through to default below
  }
  return 'output';
}

async function fetchHtml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

async function loadReferenceStyles(referencePath) {
  const buffer = fs.readFileSync(referencePath);
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const stylesFile = zip.file('word/styles.xml');
  if (!stylesFile) throw new Error(`${referencePath} has no word/styles.xml -- not a valid .docx`);
  return stylesFile.async('string');
}

async function convertBufferToOdt(docxBuffer, outputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'html2docx-'));
  const tmpDocxPath = path.join(tmpDir, 'source.docx');
  fs.writeFileSync(tmpDocxPath, docxBuffer);
  try {
    await execFileAsync('pandoc', [tmpDocxPath, '-o', outputPath]);
  } catch (err) {
    throw new Error(`odt output requires pandoc (conversion failed): ${err.message}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function convertOne(htmlContent, outputPath, { toc, referenceStylesXml, format, theme }) {
  const docxBuffer = await convertHtmlToDocx(htmlContent, { toc, referenceStylesXml, theme });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });

  if (format === 'odt') {
    await convertBufferToOdt(docxBuffer, outputPath);
  } else {
    fs.writeFileSync(outputPath, docxBuffer);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.log(HELP_TEXT);
    process.exit(2);
  }

  if (options.help || !options.input) {
    console.log(HELP_TEXT);
    process.exit(options.help ? 0 : 2);
  }

  if (options.format !== 'docx' && options.format !== 'odt') {
    console.error(`Error: unsupported format "${options.format}" (expected docx or odt)`);
    process.exit(2);
  }

  const kind = classifyInput(options.input);

  if (kind === 'directory' && options.output) {
    console.error('Error: -o/--output cannot be used with a directory input -- use --outdir instead');
    process.exit(2);
  }

  let referenceStylesXml = null;
  if (options.reference) {
    try {
      referenceStylesXml = await loadReferenceStyles(options.reference);
    } catch (err) {
      console.error(`Error loading --reference template: ${err.message}`);
      process.exit(1);
    }
  }

  const jobs = [];

  if (kind === 'url') {
    let html;
    try {
      html = await fetchHtml(options.input);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    const outputPath = resolveOutputPath(baseNameFromUrl(options.input), options);
    jobs.push({ html, outputPath, source: options.input });
  } else if (kind === 'directory') {
    if (!options.outdir) {
      console.error('Error: --outdir is required when converting a directory of files');
      process.exit(2);
    }
    const entries = fs.readdirSync(options.input).filter(f => /\.html?$/i.test(f)).sort();
    if (entries.length === 0) {
      console.error(`Error: no .html/.htm files found in ${options.input}`);
      process.exit(1);
    }
    for (const entry of entries) {
      const html = fs.readFileSync(path.join(options.input, entry), 'utf8');
      const baseName = path.basename(entry, path.extname(entry));
      const outputPath = resolveOutputPath(baseName, { outdir: options.outdir, format: options.format });
      jobs.push({ html, outputPath, source: path.join(options.input, entry) });
    }
  } else {
    if (!fs.existsSync(options.input)) {
      console.error(`Error: file not found: ${options.input}`);
      process.exit(1);
    }
    const html = fs.readFileSync(options.input, 'utf8');
    const baseName = path.basename(options.input, path.extname(options.input));
    const outputPath = resolveOutputPath(baseName, options);
    jobs.push({ html, outputPath, source: options.input });
  }

  let failures = 0;
  for (const job of jobs) {
    try {
      console.log(`Converting ${job.source} -> ${job.outputPath}`);
      await convertOne(job.html, job.outputPath, {
        toc: options.toc,
        referenceStylesXml,
        format: options.format,
        theme: options.theme
      });
      console.log(`  OK: ${job.outputPath}`);

      if (options.verify) {
        try {
          const { pdfPath, jpegPaths, warnings } = await verifyOutput(job.outputPath, {
            strictRaster: options.strictRaster
          });
          console.log(`  Verify PDF: ${pdfPath}`);
          if (jpegPaths.length > 0) console.log(`  Verify JPEGs: ${jpegPaths.join(', ')}`);
          for (const w of warnings) console.warn(`  Warning: ${w}`);
        } catch (err) {
          console.warn(`  Warning: verify step failed for ${job.outputPath}: ${err.message}`);
          console.warn('  Result was NOT visually confirmed -- inspect manually before trusting it.');
        }
      }
    } catch (err) {
      failures++;
      console.error(`  Error converting ${job.source}: ${err.message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures}/${jobs.length} conversion(s) failed.`);
    process.exit(1);
  }
}

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  main();
}
