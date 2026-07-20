import { Document, Packer, Paragraph } from 'docx';
import { parseHtml } from './parse.js';
import { applyStylesToTree } from './style.js';
import { convertBlock } from './blocks.js';

/**
 * Converts HTML content to a DOCX buffer.
 * @param {string} htmlContent
 * @param {Object} options
 * @returns {Promise<Buffer>}
 */
export async function convertHtmlToDocx(htmlContent, options = {}) {
  const root = parseHtml(htmlContent);

  // Apply CSS cascade styling engine to DOM
  applyStylesToTree(root);

  const blocks = convertBlock(root);
  // A section needs at least one block-level child to be a valid document.
  const children = blocks.length > 0 ? blocks : [new Paragraph({})];

  const doc = new Document({
    sections: [{
      properties: {},
      children
    }]
  });

  return await Packer.toBuffer(doc);
}
