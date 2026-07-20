import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import JSZip from 'jszip';
import { Document, Packer, Paragraph } from 'docx';
import { parseHtml } from '../src/parse.js';
import { applyStylesToTree } from '../src/style.js';
import { convertInline } from '../src/inline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name) {
  const html = readFileSync(path.join(__dirname, '../fixtures', name), 'utf-8');
  const root = parseHtml(html);
  applyStylesToTree(root);
  return root;
}

/**
 * Runs every child of `node` through convertInline and renders the result
 * into a real docx, then returns the raw word/document.xml (and the
 * hyperlink relationships file) so tests can assert on the actual OOXML
 * markup rather than internal object shape.
 */
async function renderParagraph(node) {
  const runs = [];
  for (const child of node.childNodes) {
    runs.push(...convertInline(child));
  }

  const doc = new Document({
    sections: [{ properties: {}, children: [new Paragraph({ children: runs })] }]
  });
  const buffer = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  const relsFile = zip.file('word/_rels/document.xml.rels');
  const relsXml = relsFile ? await relsFile.async('string') : '';
  return { documentXml, relsXml };
}

async function testBasicFormatting() {
  const root = loadFixture('inline_formatting.html');
  const { documentXml } = await renderParagraph(root.querySelector('#basic'));

  assert.ok(documentXml.includes('<w:b/>'), 'expected bold run for <strong>');
  assert.ok(documentXml.includes('<w:i/>'), 'expected italic run for <em>');
  assert.ok(documentXml.includes('w:val="single"'), 'expected single underline for <u>');
  assert.ok(documentXml.includes('<w:strike/>'), 'expected strike run for <s>');
  assert.ok(documentXml.includes('Bold'), 'expected bold text content');
  assert.ok(documentXml.includes('Italic'), 'expected italic text content');
  console.log('✓ testBasicFormatting passed');
}

async function testLineBreak() {
  const root = loadFixture('inline_formatting.html');
  const { documentXml } = await renderParagraph(root.querySelector('#br'));

  assert.ok(documentXml.includes('<w:br/>'), 'expected a break for <br>');
  assert.ok(documentXml.includes('Line one'));
  assert.ok(documentXml.includes('Line two'));
  console.log('✓ testLineBreak passed');
}

async function testCodeFormatting() {
  const root = loadFixture('code_inline.html');
  const { documentXml } = await renderParagraph(root.querySelector('#code'));

  assert.ok(documentXml.includes('Courier New'), 'expected monospace font for <code>');
  assert.ok(documentXml.includes('EDEDED'), 'expected light gray shading for <code>');
  assert.ok(documentXml.includes('w:shd'), 'expected shading element');
  assert.ok(!documentXml.includes('w:val="solid"'), 'shading must never be solid (renders black)');
  console.log('✓ testCodeFormatting passed');
}

async function testHyperlink() {
  const root = loadFixture('links.html');
  const { documentXml, relsXml } = await renderParagraph(root.querySelector('#link'));

  assert.ok(documentXml.includes('<w:hyperlink'), 'expected a real hyperlink element');
  assert.ok(documentXml.includes('Visit Example'));
  assert.ok(documentXml.includes('Hyperlink'), 'expected the built-in Hyperlink character style');
  assert.ok(relsXml.includes('https://example.com'), 'expected the href in the relationships file');
  console.log('✓ testHyperlink passed');
}

async function testStyledHyperlink() {
  const root = loadFixture('links.html');
  const { documentXml } = await renderParagraph(root.querySelector('#link-styled'));

  assert.ok(documentXml.includes('<w:hyperlink'), 'expected a real hyperlink element');
  assert.ok(documentXml.includes('008000'), 'expected explicit CSS color (green) to override the link default');
  console.log('✓ testStyledHyperlink passed');
}

async function testNestedFormatting() {
  // bold inside a link inside a color-styled span
  const root = loadFixture('nested_formatting.html');
  const { documentXml } = await renderParagraph(root.querySelector('#nested'));

  assert.ok(documentXml.includes('<w:hyperlink'), 'expected a real hyperlink element');
  assert.ok(documentXml.includes('<w:b/>'), 'expected bold run for nested <strong>');
  assert.ok(documentXml.includes('800080'), 'expected inherited purple color on nested runs');
  assert.ok(documentXml.includes('Now'));
  console.log('✓ testNestedFormatting passed');
}

async function testSpanColorAndWeight() {
  const root = loadFixture('spans.html');
  const { documentXml } = await renderParagraph(root.querySelector('#span-color'));

  assert.ok(documentXml.includes('336699'), 'expected span inline color to be converted to hex');
  assert.ok(documentXml.includes('<w:b/>'), 'expected font-weight: 700 to resolve to bold');
  console.log('✓ testSpanColorAndWeight passed');
}

async function testSpanBackground() {
  const root = loadFixture('spans.html');
  const { documentXml } = await renderParagraph(root.querySelector('#span-bg'));

  assert.ok(documentXml.includes('w:shd'), 'expected shading element for span background-color');
  assert.ok(documentXml.includes('FFFF00'), 'expected background-color: yellow to be converted to hex');
  console.log('✓ testSpanBackground passed');
}

async function runAll() {
  await testBasicFormatting();
  await testLineBreak();
  await testCodeFormatting();
  await testHyperlink();
  await testStyledHyperlink();
  await testNestedFormatting();
  await testSpanColorAndWeight();
  await testSpanBackground();
  console.log('All tests passed successfully!');
}

runAll();
