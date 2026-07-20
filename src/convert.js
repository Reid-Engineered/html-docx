import { Document, Packer, Paragraph, TableOfContents } from 'docx';
import { parseHtml } from './parse.js';
import { applyStylesToTree } from './style.js';
import { convertBlock } from './blocks.js';
import { prefetchImages } from './images.js';

/**
 * Collects h1-h6 text/level in document order for the TOC's `cachedEntries`.
 * Word recomputes the TOC (including page numbers) from the field
 * instruction on open anyway, but LibreOffice's headless PDF conversion
 * doesn't refresh field-based TOCs at all -- without a cached fallback the
 * TOC renders as a blank gap in that path, which is exactly the visual
 * verify step this project relies on for layout stages.
 * @param {import('node-html-parser').HTMLElement} root
 * @returns {Array<{title: string, level: number}>}
 */
function collectHeadingEntries(root) {
  const entries = [];
  function walk(node) {
    if (node.nodeType === 1) {
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (/^h[1-6]$/.test(tag)) {
        const title = node.text.replace(/\s+/g, ' ').trim();
        if (title) entries.push({ title, level: Number(tag[1]) });
      }
    }
    for (const child of node.childNodes || []) walk(child);
  }
  walk(root);
  return entries;
}

/**
 * Converts HTML content to a DOCX buffer.
 * @param {string} htmlContent
 * @param {Object} options
 * @param {boolean} [options.toc] Insert a Table of Contents (from h1-h6)
 *   as the first block. Word populates/refreshes it on open via
 *   `features.updateFields` -- it isn't pre-computed here.
 * @param {string} [options.referenceStylesXml] Raw `word/styles.xml`
 *   content from a reference .docx (the pandoc reference-doc pattern) --
 *   passed through to docx's `externalStyles`, replacing default styles
 *   (heading/paragraph fonts, colors, etc.) with the template's.
 * @returns {Promise<Buffer>}
 */
export async function convertHtmlToDocx(htmlContent, options = {}) {
  const root = parseHtml(htmlContent);

  // Apply CSS cascade styling engine to DOM
  applyStylesToTree(root);

  // Pre-fetch all remote images in parallel
  const imageBuffers = await prefetchImages(root);

  // Initialize conversion options context to track lists and images
  const convertOptions = {
    numberingConfigs: [],
    listCounter: 1,
    imageBuffers
  };

  const blocks = convertBlock(root, convertOptions);
  // A section needs at least one block-level child to be a valid document.
  let children = blocks.length > 0 ? blocks : [new Paragraph({})];

  if (options.toc) {
    children = [
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-6',
        cachedEntries: collectHeadingEntries(root)
      }),
      new Paragraph({}),
      ...children
    ];
  }

  const docConfig = {
    sections: [{
      properties: {},
      children
    }]
  };

  // If list elements registered numbering configurations, attach them to the document
  if (convertOptions.numberingConfigs.length > 0) {
    docConfig.numbering = {
      config: convertOptions.numberingConfigs
    };
  }

  if (options.toc) {
    docConfig.features = { updateFields: true };
  }

  if (options.referenceStylesXml) {
    docConfig.externalStyles = options.referenceStylesXml;
  }

  const doc = new Document(docConfig);

  return await Packer.toBuffer(doc);
}
