import assert from 'assert';
import JSZip from 'jszip';
import { convertHtmlToDocx } from '../src/convert.js';

// Mock remote image data
const MOCK_IMAGE_DATA = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]); // PNG signature
const MOCK_URL = 'https://example.com/test-image.png';

// Setup global fetch mock
const originalFetch = global.fetch;
global.fetch = async (url) => {
  if (url === MOCK_URL) {
    return {
      ok: true,
      headers: {
        get: (name) => {
          const n = name.toLowerCase();
          if (n === 'content-type') return 'image/png';
          if (n === 'content-length') return String(MOCK_IMAGE_DATA.length);
          return null;
        }
      },
      arrayBuffer: async () => MOCK_IMAGE_DATA.buffer
    };
  }
  if (url === 'https://example.com/too-large.png') {
    return {
      ok: true,
      headers: {
        get: (name) => {
          const n = name.toLowerCase();
          if (n === 'content-length') return String(10 * 1024 * 1024); // 10MB
          return null;
        }
      }
    };
  }
  return {
    ok: false,
    status: 404
  };
};

async function testBase64ImageDecoding() {
  // A tiny valid transparent 1x1 PNG base64
  const base64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const html = `<html><body><img src="${base64Png}" width="150" height="100"></body></html>`;
  
  const buffer = await convertHtmlToDocx(html);
  const zip = await JSZip.loadAsync(buffer);
  
  // Verify image relations and media exist in docx zip package
  const files = Object.keys(zip.files);
  const hasMedia = files.some(f => f.startsWith('word/media/'));
  assert.ok(hasMedia, 'expected docx to contain a media folder and image file');
  
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.ok(documentXml.includes('cx="1428750" cy="952500"'), 'expected dimensions scaled to EMF/EMU units'); // 150px -> ~1428750 EMUs, 100px -> ~952500 EMUs
  
  console.log('✓ testBase64ImageDecoding passed');
}

async function testRemoteImagePrefetchingAndType() {
  const html = `
    <html>
    <head>
      <style>
        img.styled { width: 50%; height: 150px; }
      </style>
    </head>
    <body>
      <img class="styled" src="${MOCK_URL}">
    </body>
    </html>
  `;
  
  const buffer = await convertHtmlToDocx(html);
  const zip = await JSZip.loadAsync(buffer);
  
  const documentXml = await zip.file('word/document.xml').async('string');
  // 50% of 600px = 300px -> ~2857500 EMUs
  // 150px -> ~1428750 EMUs
  assert.ok(documentXml.includes('cx="2857500"'), 'expected width scaled from CSS percentage');
  assert.ok(documentXml.includes('cy="1428750"'), 'expected height scaled from CSS px');
  
  console.log('✓ testRemoteImagePrefetchingAndType passed');
}

async function testFetchFailureGracefulSkip() {
  // Try to load a failing URL and an oversized URL
  const html = `
    <html>
    <body>
      <p>Before</p>
      <img src="https://example.com/not-found.png">
      <img src="https://example.com/too-large.png">
      <p>After</p>
    </body>
    </html>
  `;
  
  // This should not crash, it should just skip the images
  const buffer = await convertHtmlToDocx(html);
  const zip = await JSZip.loadAsync(buffer);
  
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.ok(documentXml.includes('Before'), 'expected text before images to exist');
  assert.ok(documentXml.includes('After'), 'expected text after images to exist');
  assert.ok(!documentXml.includes('w:drawing'), 'expected no drawing elements since images failed');
  
  console.log('✓ testFetchFailureGracefulSkip passed');
}

async function testInlineImagePlacement() {
  const base64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const html = `<html><body><p>Text before <img src="${base64Png}" width="30" height="30"> text after</p></body></html>`;
  
  const buffer = await convertHtmlToDocx(html);
  const zip = await JSZip.loadAsync(buffer);
  
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.ok(documentXml.includes('Text before'), 'expected leading text run');
  assert.ok(documentXml.includes('text after'), 'expected trailing text run');
  assert.ok(documentXml.includes('w:drawing'), 'expected drawing inline with text runs');
  
  console.log('✓ testInlineImagePlacement passed');
}

async function testInlineRemoteImageUsesPrefetchBuffers() {
  const html = `<html><body><p>Before <img src="${MOCK_URL}" width="50" height="50"> after</p></body></html>`;
  const buffer = await convertHtmlToDocx(html);
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);
  const hasMedia = files.some(f => f.startsWith('word/media/') && f !== 'word/media/');
  assert.ok(hasMedia, 'expected inline remote <img> to use prefetched buffers (imageBuffers must reach convertInline)');
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.ok(documentXml.includes('w:drawing'), 'expected drawing for inline remote image');
  assert.ok(documentXml.includes('Before') && documentXml.includes('after'));
  console.log('✓ testInlineRemoteImageUsesPrefetchBuffers passed');
}

async function runAll() {
  try {
    await testBase64ImageDecoding();
    await testRemoteImagePrefetchingAndType();
    await testFetchFailureGracefulSkip();
    await testInlineImagePlacement();
    await testInlineRemoteImageUsesPrefetchBuffers();
    console.log('All image tests passed successfully!');
  } finally {
    // Restore fetch
    global.fetch = originalFetch;
  }
}

runAll();
