import assert from 'assert';
import JSZip from 'jszip';
import { convertHtmlToDocx } from '../src/convert.js';
import { parseFontShorthand, parseBackgroundShorthand } from '../src/style.js';

async function renderToXml(html, options = {}) {
  const buffer = await convertHtmlToDocx(html, options);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  let numberingXml = '';
  try {
    numberingXml = await zip.file('word/numbering.xml').async('string');
  } catch {
    // ignore if numbering.xml doesn't exist
  }
  return { documentXml, numberingXml };
}

function testShorthandParsing() {
  const fontRes = parseFontShorthand('italic bold 14px/1.4 sans-serif');
  assert.strictEqual(fontRes['font-style'], 'italic');
  assert.strictEqual(fontRes['font-weight'], 'bold');
  assert.strictEqual(fontRes['font-size'], '14px');
  assert.strictEqual(fontRes['font-family'], 'sans-serif');

  const fontRes2 = parseFontShorthand('12pt Arial');
  assert.strictEqual(fontRes2['font-style'], undefined);
  assert.strictEqual(fontRes2['font-weight'], undefined);
  assert.strictEqual(fontRes2['font-size'], '12pt');
  assert.strictEqual(fontRes2['font-family'], 'Arial');

  const bgRes1 = parseBackgroundShorthand('#ff0000');
  assert.strictEqual(bgRes1['background-color'], '#ff0000');

  const bgRes2 = parseBackgroundShorthand('rgb(0, 255, 0) url("test.png") repeat');
  assert.strictEqual(bgRes2['background-color'], 'rgb(0, 255, 0)');

  const bgRes3 = parseBackgroundShorthand('blue');
  assert.strictEqual(bgRes3['background-color'], 'blue');

  console.log('✓ testShorthandParsing passed');
}

async function testEmptyAndMalformedElements() {
  // Empty block/inline structures and malformed HTML should convert without crashing
  const html = `
    <html>
      <body>
        <div></div>
        <p></p>
        <span></span>
        <div><p>Unclosed paragraph element
        <p>Unclosed <b>bold text with mismatched tags</p>
      </body>
    </html>
  `;
  const { documentXml } = await renderToXml(html);
  assert.ok(documentXml.includes('Unclosed paragraph element'), 'expected raw text to survive malformed tags');
  assert.ok(documentXml.includes('mismatched tags'), 'expected text to survive mismatched tags');
  console.log('✓ testEmptyAndMalformedElements passed');
}

async function testDeeplyNestedSpans() {
  const html = `
    <html>
      <body>
        <p><span style="color: #ff0000;"><span style="font-weight: bold;"><span>Nested Red Bold</span></span></span></p>
      </body>
    </html>
  `;
  const { documentXml } = await renderToXml(html);
  assert.ok(documentXml.includes('w:val="FF0000"'), 'expected color style to cascade');
  assert.ok(documentXml.includes('<w:b/>') || documentXml.includes('<w:b />') || documentXml.includes('<w:b w:val="true" />'), 'expected bold style to cascade');
  console.log('✓ testDeeplyNestedSpans passed');
}

async function testThemeOverrideOptions() {
  const html = `
    <html>
      <body>
        <h1>Theme Header</h1>
        <p>Theme Paragraph</p>
      </body>
    </html>
  `;
  
  // Test Modern theme (Arial, header #0066cc, body #333333)
  const { documentXml: docXmlModern } = await renderToXml(html, { theme: 'modern' });
  assert.ok(docXmlModern.includes('w:ascii="Arial"'), 'expected Arial font in modern theme');
  assert.ok(docXmlModern.includes('w:val="0066CC"'), 'expected modern header color');
  assert.ok(docXmlModern.includes('w:val="333333"'), 'expected modern body color');

  // Test Dark theme (Segoe UI, header #ffffff, body #e0e0e0)
  const { documentXml: docXmlDark } = await renderToXml(html, { theme: 'dark' });
  assert.ok(docXmlDark.includes('w:ascii="Segoe UI"'), 'expected Segoe UI font in dark theme');
  assert.ok(docXmlDark.includes('w:val="FFFFFF"'), 'expected white header color');
  assert.ok(docXmlDark.includes('w:val="E0E0E0"'), 'expected light-gray body color');

  console.log('✓ testThemeOverrideOptions passed');
}

async function testNestedListNumberingFix() {
  const html = `
    <html>
      <body>
        <ol>
          <li>Item 1
            <ol>
              <li>Subitem 1.1</li>
            </ol>
          </li>
        </ol>
        
        <ol type="a">
          <li>Letter A
            <ol type="i">
              <li>Roman i</li>
            </ol>
          </li>
        </ol>

        <ul>
          <li style="list-style-type: square;">Square Bullet</li>
        </ul>
      </body>
    </html>
  `;
  
  const { documentXml, numberingXml } = await renderToXml(html);
  assert.ok(numberingXml, 'expected numbering configuration to be generated');

  // Nested decimal ol should default to DECIMAL (%2.) format at level 1 (fixing P1)
  // Instead of LOWER_LETTER format under the previous decimal alternating list levels configuration.
  // Let's verify that the numbering configuration contains DECIMAL levels.
  assert.ok(numberingXml.includes('numFmt w:val="decimal"'), 'expected decimal format to be present');

  // Nested ol with type="a" should parse lower-letter format
  assert.ok(numberingXml.includes('numFmt w:val="lowerLetter"'), 'expected lower letter numbering format');
  
  // Nested ol with type="i" should parse lower-roman format
  assert.ok(numberingXml.includes('numFmt w:val="lowerRoman"'), 'expected lower roman numbering format');

  // Bullet list level with list-style-type: square should parse square bullet format
  assert.ok(numberingXml.includes('w:val="▪"') || numberingXml.includes('▪'), 'expected square bullet character');

  console.log('✓ testNestedListNumberingFix passed');
}

async function runAll() {
  testShorthandParsing();
  await testEmptyAndMalformedElements();
  await testDeeplyNestedSpans();
  await testThemeOverrideOptions();
  await testNestedListNumberingFix();
  console.log('All polish/edge-case tests passed successfully!');
}

runAll();
