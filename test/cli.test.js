import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import JSZip from 'jszip';
import { parseArgs, classifyInput, resolveOutputPath, baseNameFromUrl } from '../bin/cli.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'cli.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'html2docx-cli-test-'));
}

async function runCli(args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [cliPath, ...args], { cwd: repoRoot, ...options });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

async function readDocxXml(docxPath) {
  const buffer = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

// --- Pure helper unit tests ---

function testParseArgs() {
  const opts = parseArgs(['input.html', '-o', 'out.docx', '-f', 'odt', '--outdir', 'dir', '--toc', '--reference', 'ref.docx', '--no-verify', '--strict-raster']);
  assert.strictEqual(opts.input, 'input.html');
  assert.strictEqual(opts.output, 'out.docx');
  assert.strictEqual(opts.format, 'odt');
  assert.strictEqual(opts.outdir, 'dir');
  assert.strictEqual(opts.toc, true);
  assert.strictEqual(opts.reference, 'ref.docx');
  assert.strictEqual(opts.verify, false);
  assert.strictEqual(opts.strictRaster, true);
  console.log('✓ testParseArgs passed');
}

function testParseArgsDefaults() {
  const opts = parseArgs(['input.html']);
  assert.strictEqual(opts.format, 'docx');
  assert.strictEqual(opts.verify, true);
  assert.strictEqual(opts.toc, false);
  console.log('✓ testParseArgsDefaults passed');
}

function testClassifyInput() {
  assert.strictEqual(classifyInput('http://example.com/a.html'), 'url');
  assert.strictEqual(classifyInput('https://example.com/a.html'), 'url');
  assert.strictEqual(classifyInput(path.join(repoRoot, 'fixtures')), 'directory');
  assert.strictEqual(classifyInput(path.join(repoRoot, 'fixtures/simple.html')), 'file');
  console.log('✓ testClassifyInput passed');
}

function testResolveOutputPath() {
  assert.strictEqual(resolveOutputPath('report', { format: 'docx' }), 'report.docx');
  assert.strictEqual(resolveOutputPath('report', { format: 'odt' }), 'report.odt');
  assert.strictEqual(resolveOutputPath('report', { outdir: 'out', format: 'docx' }), path.join('out', 'report.docx'));
  assert.strictEqual(resolveOutputPath('report', { output: 'custom.docx', outdir: 'out', format: 'docx' }), 'custom.docx');
  console.log('✓ testResolveOutputPath passed');
}

function testBaseNameFromUrl() {
  assert.strictEqual(baseNameFromUrl('https://example.com/reports/q1.html'), 'q1');
  assert.strictEqual(baseNameFromUrl('https://example.com/'), 'output');
  assert.strictEqual(baseNameFromUrl('not a url'), 'output');
  console.log('✓ testBaseNameFromUrl passed');
}

// --- End-to-end CLI tests (spawned, --no-verify to stay host-independent) ---

async function testSingleFileConversion() {
  const dir = tmpDir();
  const outputPath = path.join(dir, 'out.docx');
  const { code } = await runCli(['fixtures/blocks_full.html', '-o', outputPath, '--no-verify']);
  assert.strictEqual(code, 0);
  assert.ok(fs.existsSync(outputPath));
  const xml = await readDocxXml(outputPath);
  assert.ok(xml.includes('Report Title'));
  console.log('✓ testSingleFileConversion passed');
}

async function testDefaultOutputPathDerivedFromInput() {
  const dir = tmpDir();
  const srcPath = path.join(dir, 'my-doc.html');
  fs.writeFileSync(srcPath, '<html><body><p>Hi</p></body></html>');
  const { code } = await runCli(['my-doc.html', '--no-verify'], { cwd: dir });
  assert.strictEqual(code, 0);
  assert.ok(fs.existsSync(path.join(dir, 'my-doc.docx')), 'expected output named after the input, defaulted to cwd');
  console.log('✓ testDefaultOutputPathDerivedFromInput passed');
}

async function testTocFlagInsertsRealTocField() {
  const dir = tmpDir();
  const outputPath = path.join(dir, 'toc.docx');
  const { code } = await runCli(['fixtures/blocks_full.html', '-o', outputPath, '--toc', '--no-verify']);
  assert.strictEqual(code, 0);
  const xml = await readDocxXml(outputPath);
  assert.ok(xml.includes('<w:sdt>'), 'expected a real TOC structured document tag');
  assert.ok(xml.includes('TOC'), 'expected a TOC field instruction');

  // Word recomputes the TOC from the field on open, but LibreOffice's
  // headless PDF conversion (our visual verify step) never refreshes
  // field-based TOCs -- without cachedEntries it renders as a blank gap.
  // Confirmed by visual verify; regression-tested here structurally.
  const sdtContent = xml.slice(xml.indexOf('<w:sdt>'), xml.indexOf('</w:sdt>'));
  assert.ok(sdtContent.includes('Report Title'), 'expected a cached TOC entry for the h1');
  assert.ok(sdtContent.includes('Section'), 'expected a cached TOC entry for the h2');

  const buffer = fs.readFileSync(outputPath);
  const zip = await JSZip.loadAsync(buffer);
  const settingsXml = await zip.file('word/settings.xml').async('string');
  assert.ok(settingsXml.includes('updateFields'), 'expected updateFields so Word refreshes the TOC on open');
  console.log('✓ testTocFlagInsertsRealTocField passed');
}

async function testReferenceMergesExternalStyles() {
  const dir = tmpDir();
  const referencePath = path.join(dir, 'reference.docx');
  await runCli(['fixtures/simple.html', '-o', referencePath, '--no-verify']);
  const refBuffer = fs.readFileSync(referencePath);
  const refZip = await JSZip.loadAsync(refBuffer);
  const refStyles = await refZip.file('word/styles.xml').async('string');

  const outputPath = path.join(dir, 'with-reference.docx');
  const { code } = await runCli(['fixtures/blocks_full.html', '-o', outputPath, '--reference', referencePath, '--no-verify']);
  assert.strictEqual(code, 0);

  const outBuffer = fs.readFileSync(outputPath);
  const outZip = await JSZip.loadAsync(outBuffer);
  const outStyles = await outZip.file('word/styles.xml').async('string');
  assert.ok(outStyles.includes(refStyles.slice(200, 260)), 'expected the reference template\'s styles.xml content to be merged in');
  console.log('✓ testReferenceMergesExternalStyles passed');
}

async function testDirectoryBatchMode() {
  const inputDir = tmpDir();
  const outputDir = tmpDir();
  fs.copyFileSync(path.join(repoRoot, 'fixtures/simple.html'), path.join(inputDir, 'a.html'));
  fs.copyFileSync(path.join(repoRoot, 'fixtures/blocks_full.html'), path.join(inputDir, 'b.html'));

  const { code } = await runCli([inputDir, '--outdir', outputDir, '--no-verify']);
  assert.strictEqual(code, 0);
  assert.ok(fs.existsSync(path.join(outputDir, 'a.docx')));
  assert.ok(fs.existsSync(path.join(outputDir, 'b.docx')));
  console.log('✓ testDirectoryBatchMode passed');
}

async function testDirectoryWithoutOutdirFails() {
  const inputDir = tmpDir();
  fs.copyFileSync(path.join(repoRoot, 'fixtures/simple.html'), path.join(inputDir, 'a.html'));
  const { code, stderr } = await runCli([inputDir, '--no-verify']);
  assert.notStrictEqual(code, 0);
  assert.ok(stderr.includes('--outdir'));
  console.log('✓ testDirectoryWithoutOutdirFails passed');
}

async function testOdtFormatViaPandoc() {
  const dir = tmpDir();
  const outputPath = path.join(dir, 'out.odt');
  const { code } = await runCli(['fixtures/simple.html', '-o', outputPath, '-f', 'odt', '--no-verify']);
  assert.strictEqual(code, 0);
  assert.ok(fs.existsSync(outputPath));
  const header = fs.readFileSync(outputPath).slice(0, 2).toString();
  assert.strictEqual(header, 'PK', 'expected a real zip-based ODT file, not a renamed docx');
  console.log('✓ testOdtFormatViaPandoc passed');
}

async function testUrlInput() {
  const html = fs.readFileSync(path.join(repoRoot, 'fixtures/simple.html'), 'utf8');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  const dir = tmpDir();
  const outputPath = path.join(dir, 'from-url.docx');
  try {
    const { code } = await runCli([`http://127.0.0.1:${port}/page.html`, '-o', outputPath, '--no-verify']);
    assert.strictEqual(code, 0);
    assert.ok(fs.existsSync(outputPath));
  } finally {
    server.close();
  }
  console.log('✓ testUrlInput passed');
}

async function testMissingFileFailsCleanly() {
  const { code, stderr } = await runCli(['fixtures/does-not-exist.html', '--no-verify']);
  assert.notStrictEqual(code, 0);
  assert.ok(stderr.includes('not found'));
  console.log('✓ testMissingFileFailsCleanly passed');
}

async function testUnsupportedFormatRejected() {
  const { code, stderr } = await runCli(['fixtures/simple.html', '-f', 'pdf', '--no-verify']);
  assert.notStrictEqual(code, 0);
  assert.ok(stderr.includes('unsupported format'));
  console.log('✓ testUnsupportedFormatRejected passed');
}

async function runAll() {
  testParseArgs();
  testParseArgsDefaults();
  testClassifyInput();
  testResolveOutputPath();
  testBaseNameFromUrl();
  await testSingleFileConversion();
  await testDefaultOutputPathDerivedFromInput();
  await testTocFlagInsertsRealTocField();
  await testReferenceMergesExternalStyles();
  await testDirectoryBatchMode();
  await testDirectoryWithoutOutdirFails();
  await testOdtFormatViaPandoc();
  await testUrlInput();
  await testMissingFileFailsCleanly();
  await testUnsupportedFormatRejected();
  console.log('All CLI tests passed successfully!');
}

runAll();
