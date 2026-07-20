import { Document, Packer, Paragraph } from 'docx';
import { parseHtml } from './parse.js';
import { applyStylesToTree } from './style.js';
import { convertBlock } from './blocks.js';
import { prefetchImages } from './images.js';

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
  const children = blocks.length > 0 ? blocks : [new Paragraph({})];

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

  const doc = new Document(docConfig);

  return await Packer.toBuffer(doc);
}
