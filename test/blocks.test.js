import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import JSZip from 'jszip';
import { convertHtmlToDocx } from '../src/convert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function renderFixture(name) {
  const html = readFileSync(path.join(__dirname, '../fixtures', name), 'utf-8');
  const buffer = await convertHtmlToDocx(html);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  return documentXml;
}

async function testHeadingUsesCssColorAndSize() {
  const xml = await renderFixture('blocks_full.html');
  // h1 { color: #0066cc; font-size: 28px } -> 28px = 21pt = 42 half-points
  assert.ok(xml.includes('w:val="Heading1"'), 'expected a real Heading1 paragraph style');
  assert.ok(xml.includes('Report Title'));
  assert.ok(xml.includes('0066CC'), 'expected the CSS heading color as direct run formatting');
  assert.ok(xml.includes('<w:sz w:val="42"'), 'expected 28px -> 21pt -> 42 half-points as direct run size');
  console.log('✓ testHeadingUsesCssColorAndSize passed');
}

async function testParagraphTagLevelCssAppliesToBareText() {
  const xml = await renderFixture('blocks_full.html');
  // <p class="lead"> has no wrapping <span> around its text -- the bold/
  // green must come from the tag's own computed style, not a child node.
  assert.ok(xml.includes('This paragraph is bold and green'));
  const idx = xml.indexOf('This paragraph is bold and green');
  const context = xml.slice(Math.max(0, idx - 200), idx);
  assert.ok(context.includes('<w:b/>'), 'expected bold from p.lead { font-weight: 700 }');
  assert.ok(context.includes('008000'), 'expected green from p.lead { color: green }');
  console.log('✓ testParagraphTagLevelCssAppliesToBareText passed');
}

async function testParagraphMixedInlineAndHyperlink() {
  const xml = await renderFixture('blocks_full.html');
  assert.ok(xml.includes('<w:b/>'));
  assert.ok(xml.includes('<w:hyperlink'));
  assert.ok(xml.includes('a link'));
  console.log('✓ testParagraphMixedInlineAndHyperlink passed');
}

async function testBlockquoteIndentAndBorder() {
  const xml = await renderFixture('blocks_full.html');
  assert.ok(xml.includes('A quoted thought'));
  const idx = xml.indexOf('A quoted thought');
  const context = xml.slice(Math.max(0, idx - 400), idx);
  assert.ok(context.includes('w:pBdr'), 'expected a paragraph border element');
  assert.ok(context.includes('w:left'), 'expected a left border specifically');
  assert.ok(context.includes('w:ind') && context.includes('720'), 'expected a 720 DXA left indent');
  console.log('✓ testBlockquoteIndentAndBorder passed');
}

async function testPrePreservesWhitespaceAndMonospace() {
  const xml = await renderFixture('blocks_full.html');
  assert.ok(xml.includes('function greet()'));
  assert.ok(xml.includes('xml:space="preserve">  console.log'), 'expected indentation preserved verbatim inside <pre>');
  assert.ok(xml.includes('Courier New'));
  assert.ok(xml.includes('F5F5F5'));
  assert.ok((xml.match(/<w:br\/>/g) || []).length >= 2, 'expected line breaks between pre lines');
  console.log('✓ testPrePreservesWhitespaceAndMonospace passed');
}

async function testHrBottomBorderNotTable() {
  const xml = await renderFixture('blocks_full.html');
  assert.ok(!xml.includes('<w:tbl>'), 'a rule must never be rendered as a table');
  // Between the pre block and the trailing paragraph there should be an
  // empty paragraph carrying only a bottom border.
  const preIdx = xml.indexOf('Courier New');
  const afterIdx = xml.indexOf('After the rule');
  const between = xml.slice(preIdx, afterIdx);
  assert.ok(between.includes('w:bottom'), 'expected a bottom border for <hr>');
  console.log('✓ testHrBottomBorderNotTable passed');
}

async function testDoctypeNotRenderedAsContent() {
  // node-html-parser surfaces a leading <!DOCTYPE html> as a plain text
  // node at the root -- it must never leak into the document body.
  const buffer = await convertHtmlToDocx(
    '<!DOCTYPE html><html><body><p>Real content</p></body></html>'
  );
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(!/doctype/i.test(xml), 'DOCTYPE declaration must not appear in document body');
  assert.ok(xml.includes('Real content'));
  console.log('✓ testDoctypeNotRenderedAsContent passed');
}

async function testEmptyDocumentStillValid() {
  const buffer = await convertHtmlToDocx('<html><body></body></html>');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.includes('<w:body>'), 'expected a valid (if empty) document body');
  console.log('✓ testEmptyDocumentStillValid passed');
}

async function runAll() {
  await testHeadingUsesCssColorAndSize();
  await testParagraphTagLevelCssAppliesToBareText();
  await testParagraphMixedInlineAndHyperlink();
  await testBlockquoteIndentAndBorder();
  await testPrePreservesWhitespaceAndMonospace();
  await testHrBottomBorderNotTable();
  await testDoctypeNotRenderedAsContent();
  await testEmptyDocumentStillValid();
  console.log('All tests passed successfully!');
}

runAll();
