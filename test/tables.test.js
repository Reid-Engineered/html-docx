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
  return zip.file('word/document.xml').async('string');
}

async function testRealTableElement() {
  const xml = await renderFixture('table_shaded_header.html');
  assert.ok(xml.includes('<w:tbl>'), 'expected a real docx Table element');
  assert.ok(!xml.includes('<w:tab '), 'must not fall back to tab-separated text');
  console.log('✓ testRealTableElement passed');
}

async function testHeaderRowBoldAndShaded() {
  const xml = await renderFixture('table_shaded_header.html');
  const headerRowEnd = xml.indexOf('</w:tr>');
  const headerRow = xml.slice(xml.indexOf('<w:tr>'), headerRowEnd);

  assert.ok(headerRow.includes('Name') && headerRow.includes('Role') && headerRow.includes('Team'));
  assert.ok(headerRow.includes('<w:b/>'), 'expected header cells to be bold');
  assert.ok(headerRow.includes('w:fill="D9D9D9"'), 'expected header shading fill');
  assert.ok(headerRow.includes('w:val="clear"'), 'shading must use CLEAR, never SOLID');
  assert.ok(!headerRow.includes('w:val="solid"'), 'shading must never be solid (renders black)');
  console.log('✓ testHeaderRowBoldAndShaded passed');
}

async function testDataRowsNotBoldOrShaded() {
  const xml = await renderFixture('table_shaded_header.html');
  const adaIdx = xml.indexOf('Ada');
  const rowStart = xml.lastIndexOf('<w:tr>', adaIdx);
  const rowEnd = xml.indexOf('</w:tr>', adaIdx);
  const row = xml.slice(rowStart, rowEnd);

  assert.ok(!row.includes('<w:shd'), 'data rows should not carry header shading');
  console.log('✓ testDataRowsNotBoldOrShaded passed');
}

async function testNestedInlineFormattingInCell() {
  const xml = await renderFixture('table_shaded_header.html');
  // <td><strong>Lead</strong> Engineer</td>
  const idx = xml.indexOf('Lead');
  const context = xml.slice(Math.max(0, idx - 150), idx);
  assert.ok(context.includes('<w:b/>'), 'expected <strong> inside a cell to still resolve to bold');
  assert.ok(xml.includes('Engineer'));
  console.log('✓ testNestedInlineFormattingInCell passed');
}

async function testColumnWidthsSumToTableWidth() {
  const xml = await renderFixture('table_shaded_header.html');
  const tblWMatch = xml.match(/<w:tblW w:type="dxa" w:w="(\d+)"\/>/);
  const gridCols = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1]));
  assert.ok(tblWMatch, 'expected an explicit DXA table width');
  const tableWidth = Number(tblWMatch[1]);
  const sum = gridCols.reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, tableWidth, 'column widths must sum exactly to the table width');
  console.log('✓ testColumnWidthsSumToTableWidth passed');
}

async function testRowspanUsesVerticalMerge() {
  const xml = await renderFixture('table_merged_cells.html');
  assert.ok(xml.includes('w:val="restart"'), 'expected a vMerge restart on the rowspan origin cell');
  assert.ok(xml.includes('w:val="continue"'), 'expected an auto-generated vMerge continuation cell');
  // Only one visible "Q1" -- the continuation row must not repeat the text.
  assert.strictEqual((xml.match(/Q1/g) || []).length, 1);
  console.log('✓ testRowspanUsesVerticalMerge passed');
}

async function testColspanUsesGridSpan() {
  const xml = await renderFixture('table_merged_cells.html');
  const idx = xml.indexOf('Totals below');
  const context = xml.slice(Math.max(0, idx - 200), idx);
  assert.ok(context.includes('w:gridSpan w:val="3"'), 'expected a 3-column gridSpan on the merged cell');
  // The merged cell's own width should equal the full table width (3 columns).
  assert.ok(context.includes('w:w="9000"'), 'expected the spanned cell width to equal all 3 columns combined');
  console.log('✓ testColspanUsesGridSpan passed');
}

async function testMergedCellsFixtureHasRealTable() {
  const xml = await renderFixture('table_merged_cells.html');
  assert.ok(xml.includes('<w:tbl>'));
  assert.ok(xml.includes('100') && xml.includes('120') && xml.includes('Jan') && xml.includes('Feb'));
  console.log('✓ testMergedCellsFixtureHasRealTable passed');
}

async function runAll() {
  await testRealTableElement();
  await testHeaderRowBoldAndShaded();
  await testDataRowsNotBoldOrShaded();
  await testNestedInlineFormattingInCell();
  await testColumnWidthsSumToTableWidth();
  await testRowspanUsesVerticalMerge();
  await testColspanUsesGridSpan();
  await testMergedCellsFixtureHasRealTable();
  console.log('All tests passed successfully!');
}

runAll();
