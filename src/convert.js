import { Document, Packer } from 'docx';
import { parseHtml } from './parse.js';

/**
 * Converts HTML content to a DOCX buffer.
 * @param {string} htmlContent
 * @param {Object} options
 * @returns {Promise<Buffer>}
 */
export async function convertHtmlToDocx(htmlContent, options = {}) {
  const root = parseHtml(htmlContent);
  
  // Create an empty stub document
  const doc = new Document({
    sections: [{
      properties: {},
      children: []
    }]
  });
  
  return await Packer.toBuffer(doc);
}
