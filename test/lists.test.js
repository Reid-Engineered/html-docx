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
  
  let numberingXml = '';
  try {
    numberingXml = await zip.file('word/numbering.xml').async('string');
  } catch (e) {
    // It's possible there's no numbering file if there are no lists (not the case here)
  }
  
  return { documentXml, numberingXml };
}

async function testListStructureAndLevelIndents() {
  const { documentXml, numberingXml } = await renderFixture('lists_full.html');
  
  // Verify numbering XML has list styles defined
  assert.ok(numberingXml, 'expected word/numbering.xml to exist');
  assert.ok(numberingXml.includes('w:num'), 'expected numbering instances');
  assert.ok(numberingXml.includes('w:abstractNum'), 'expected abstract numbering definitions');
  
  // Verify bullet levels format exist
  assert.ok(numberingXml.includes('w:val="bullet"'), 'expected bullet format definition');
  assert.ok(numberingXml.includes('w:val="decimal"'), 'expected decimal format definition');
  
  // Verify paragraph list mapping (numPr elements)
  assert.ok(documentXml.includes('w:numPr'), 'expected list paragraphs to contain w:numPr properties');
  assert.ok(documentXml.includes('Bullet item 1'));
  assert.ok(documentXml.includes('Numbered item 1'));
  
  // Verify nested levels in documentXml
  assert.ok(documentXml.includes('w:ilvl w:val="0"'), 'expected top-level list items (level 0)');
  assert.ok(documentXml.includes('w:ilvl w:val="1"'), 'expected level 1 nested list items');
  assert.ok(documentXml.includes('w:ilvl w:val="2"'), 'expected level 2 nested list items');
  
  console.log('✓ testListStructureAndLevelIndents passed');
}

async function testInlineStylePreservationInListItem() {
  const { documentXml } = await renderFixture('lists_full.html');
  
  // Bullet item 2 has red bold text: "with bold red inline style"
  assert.ok(documentXml.includes('with bold red'), 'expected list item inline text to exist');
  
  const idx = documentXml.indexOf('with bold red');
  const context = documentXml.slice(Math.max(0, idx - 300), idx);
  
  assert.ok(context.includes('<w:b/>') || context.includes('w:b w:val="true"'), 'expected bold formatting run inside list item');
  assert.ok(context.includes('FF0000'), 'expected red color (FF0000) formatting run inside list item');
  
  console.log('✓ testInlineStylePreservationInListItem passed');
}

async function testSeparateListsNumberIdRestart() {
  const { documentXml } = await renderFixture('lists_full.html');
  
  // We want to extract all numId values applied to list paragraphs.
  // There are three top-level lists in the HTML document:
  // 1. Simple Bullet List (ul)
  // 2. Simple Numbered List (ol)
  // 3. Nested Mixed Lists (ul) -> which has ol nested inside it.
  // 4. Separate List for Restart Testing (ol)
  
  // Regex to match all numId values in documentXml
  const numIdMatches = [...documentXml.matchAll(/<w:numId w:val="(\d+)"\s*\/>/g)].map(m => m[1]);
  
  // Each separate list instance (including nested lists) gets its own unique reference,
  // which compiles to separate concrete numIds.
  assert.ok(numIdMatches.length >= 6, 'expected at least 6 numbered/bulleted paragraphs');
  
  // Let's check the numId of the first numbered list (Numbered item 1)
  const n1Idx = documentXml.indexOf('Numbered item 1');
  const n1Context = documentXml.slice(n1Idx - 300, n1Idx);
  const n1NumIdMatch = n1Context.match(/<w:numId w:val="(\d+)"/);
  const n1NumId = n1NumIdMatch ? n1NumIdMatch[1] : null;
  
  // Let's check the numId of the restart numbered list (New Numbered 1)
  const n2Idx = documentXml.indexOf('New Numbered 1');
  const n2Context = documentXml.slice(n2Idx - 300, n2Idx);
  const n2NumIdMatch = n2Context.match(/<w:numId w:val="(\d+)"/);
  const n2NumId = n2NumIdMatch ? n2NumIdMatch[1] : null;
  
  assert.ok(n1NumId, 'expected to find numId for first numbered list');
  assert.ok(n2NumId, 'expected to find numId for second numbered list');
  assert.notStrictEqual(n1NumId, n2NumId, 'expected different numId for restarted list to reset numbering');
  
  console.log('✓ testSeparateListsNumberIdRestart passed');
}

async function testPostListElementsHaveNoNumbering() {
  const { documentXml } = await renderFixture('lists_full.html');
  
  const idx = documentXml.indexOf('Simple Numbered List');
  assert.ok(idx !== -1);
  
  const pStart = documentXml.lastIndexOf('<w:p ', idx);
  const pPrStart = documentXml.indexOf('<w:pPr>', pStart);
  const pPrEnd = documentXml.indexOf('</w:pPr>', pPrStart);
  const pPrContent = documentXml.slice(pPrStart, pPrEnd);
  
  assert.ok(!pPrContent.includes('w:numPr'), 'expected headings/paragraphs outside lists to have no numbering properties');
  console.log('✓ testPostListElementsHaveNoNumbering passed');
}

async function runAll() {
  await testListStructureAndLevelIndents();
  await testInlineStylePreservationInListItem();
  await testSeparateListsNumberIdRestart();
  await testPostListElementsHaveNoNumbering();
  console.log('All list tests passed successfully!');
}

runAll();
