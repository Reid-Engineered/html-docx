import { Document, Packer } from 'docx';
import { parseHtml } from './parse.js';
import { applyStylesToTree } from './style.js';

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
  
  // Create an empty stub document (for now)
  const doc = new Document({
    sections: [{
      properties: {},
      children: []
    }]
  });
  
  return await Packer.toBuffer(doc);
}
