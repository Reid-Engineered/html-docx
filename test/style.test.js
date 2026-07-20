import assert from 'assert';
import { parseHtml } from '../src/parse.js';
import { applyStylesToTree } from '../src/style.js';

// 1. Test tag selector only
function testTagSelector() {
  const html = `<html><head><style>p { color: red; font-family: Arial; }</style></head><body><p>Hello</p></body></html>`;
  const root = parseHtml(html);
  applyStylesToTree(root);
  const p = root.querySelector('p');
  assert.strictEqual(p.computedStyle.color, 'red');
  assert.strictEqual(p.computedStyle['font-family'], 'Arial');
  console.log("✓ testTagSelector passed");
}

// 2. Test class override
function testClassOverride() {
  const html = `<html><head><style>p { color: red; } .blue { color: blue; }</style></head><body><p class="blue">Hello</p></body></html>`;
  const root = parseHtml(html);
  applyStylesToTree(root);
  const p = root.querySelector('p');
  assert.strictEqual(p.computedStyle.color, 'blue');
  console.log("✓ testClassOverride passed");
}

// 3. Test inline override
function testInlineOverride() {
  const html = `<html><head><style>p { color: red; } .blue { color: blue; }</style></head><body><p class="blue" style="color: green;">Hello</p></body></html>`;
  const root = parseHtml(html);
  applyStylesToTree(root);
  const p = root.querySelector('p');
  assert.strictEqual(p.computedStyle.color, 'green');
  console.log("✓ testInlineOverride passed");
}

// 4. Test nested inheritance
function testNestedInheritance() {
  const html = `<html><head><style>div { color: purple; font-family: Courier; }</style></head><body><div><p><span>Hello</span></p></div></body></html>`;
  const root = parseHtml(html);
  applyStylesToTree(root);
  const div = root.querySelector('div');
  const p = root.querySelector('p');
  const span = root.querySelector('span');
  
  assert.strictEqual(div.computedStyle.color, 'purple');
  assert.strictEqual(p.computedStyle.color, 'purple');
  assert.strictEqual(span.computedStyle.color, 'purple');
  
  assert.strictEqual(div.computedStyle['font-family'], 'Courier');
  assert.strictEqual(p.computedStyle['font-family'], 'Courier');
  assert.strictEqual(span.computedStyle['font-family'], 'Courier');
  console.log("✓ testNestedInheritance passed");
}

// 5. Test em/rem sizing
function testRelativeSizing() {
  const html = `
    <html>
    <head>
      <style>
        html { font-size: 16px; } /* 16px = 12pt */
        body { font-size: 1.5rem; } /* 1.5 * 12pt = 18pt */
        div { font-size: 2em; } /* 2 * 18pt = 36pt */
        p { font-size: 50%; } /* 50% * 36pt = 18pt */
      </style>
    </head>
    <body>
      <div>
        <p>Hello</p>
      </div>
    </body>
    </html>
  `;
  const root = parseHtml(html);
  // Default root font size is 12pt (which corresponds to 16px if we treat it as 1.0rem)
  applyStylesToTree(root, '12pt');
  
  const body = root.querySelector('body');
  const div = root.querySelector('div');
  const p = root.querySelector('p');
  
  assert.strictEqual(body.computedStyle['font-size'], '18pt');
  assert.strictEqual(div.computedStyle['font-size'], '36pt');
  assert.strictEqual(p.computedStyle['font-size'], '18pt');
  console.log("✓ testRelativeSizing passed");
}

// 6. Test combined tag.class override and specificity ties
function testSpecificity() {
  const html = `
    <html>
    <head>
      <style>
        p { color: red; }
        .blue { color: blue; }
        p.blue { color: green; }
        p.yellow { color: yellow; }
        p.blue { color: purple; } /* later wins specificity tie */
      </style>
    </head>
    <body>
      <p class="blue">Hello</p>
    </body>
    </html>
  `;
  const root = parseHtml(html);
  applyStylesToTree(root);
  const p = root.querySelector('p');
  assert.strictEqual(p.computedStyle.color, 'purple');
  console.log("✓ testSpecificity passed");
}

function runAll() {
  testTagSelector();
  testClassOverride();
  testInlineOverride();
  testNestedInheritance();
  testRelativeSizing();
  testSpecificity();
  console.log("All tests passed successfully!");
}

runAll();
