import { parse } from 'node-html-parser';

/**
 * Parses HTML string into a DOM structure.
 * @param {string} htmlContent
 * @returns {import('node-html-parser').HTMLElement}
 */
export function parseHtml(htmlContent) {
  return parse(htmlContent);
}
