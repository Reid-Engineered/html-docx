import { Paragraph, TextRun, HeadingLevel, BorderStyle, ShadingType } from 'docx';
import { convertInline, resolveRunProps, BASE_PROPS } from './inline.js';

const HEADING_LEVELS = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6
};

// Generic containers whose block-level children we just flatten into.
const BLOCK_CONTAINER_TAGS = new Set([
  'html', 'body', 'div', 'section', 'article', 'header', 'footer',
  'main', 'aside', 'nav', 'figure', 'figcaption'
]);

const SKIPPED_TAGS = new Set(['style', 'script', 'head', 'title', 'meta', 'link']);

const RULE_COLOR = '999999';
const BLOCKQUOTE_BORDER_COLOR = '999999';
const BLOCKQUOTE_INDENT_DXA = 720; // 0.5in
const PRE_FONT = 'Courier New';
const PRE_SHADING_FILL = 'F5F5F5';

/**
 * A lone text node directly inside a block element (e.g. `<h1>Title</h1>`,
 * no wrapping `<span>`) has no `computedStyle` of its own to resolve color/
 * size/weight from. Resolve the block element's own tag+CSS formatting
 * once and seed it as the "inherited" base passed into convertInline, so
 * a CSS-styled heading keeps its color/size instead of falling back to
 * docx defaults.
 * @param {import('node-html-parser').HTMLElement} node
 * @returns {Array<TextRun|import('docx').ExternalHyperlink>}
 */
function collectInlineChildren(node) {
  const inherited = resolveRunProps(node, node.computedStyle || {}, BASE_PROPS);
  const runs = [];
  for (const child of node.childNodes) {
    runs.push(...convertInline(child, undefined, { inherited }));
  }
  return runs;
}

function convertHeading(node, tagName) {
  return [new Paragraph({
    heading: HEADING_LEVELS[tagName],
    children: collectInlineChildren(node)
  })];
}

function convertParagraph(node) {
  return [new Paragraph({ children: collectInlineChildren(node) })];
}

function convertBlockquote(node) {
  return [new Paragraph({
    children: collectInlineChildren(node),
    indent: { left: BLOCKQUOTE_INDENT_DXA },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: BLOCKQUOTE_BORDER_COLOR, space: 8 }
    }
  })];
}

/**
 * Concatenates all descendant text, ignoring nested tag formatting —
 * `<pre>` needs verbatim whitespace/newlines, which convertInline's text
 * handling deliberately collapses (correct for normal flow content, wrong
 * here).
 * @param {import('node-html-parser').HTMLElement} node
 * @returns {string}
 */
function getRawText(node) {
  if (node.nodeType === 3) return node.text;
  if (node.nodeType !== 1) return '';
  let text = '';
  for (const child of node.childNodes) text += getRawText(child);
  return text;
}

function convertPre(node) {
  let raw = getRawText(node);
  if (raw.startsWith('\n')) raw = raw.slice(1); // browsers drop the newline right after <pre>
  if (raw.endsWith('\n')) raw = raw.slice(0, -1);
  const lines = raw.split('\n');

  const children = [];
  lines.forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ break: 1 }));
    if (line.length > 0) children.push(new TextRun({ text: line, font: PRE_FONT }));
  });

  return [new Paragraph({
    children,
    shading: { fill: PRE_SHADING_FILL, type: ShadingType.CLEAR, color: 'auto' }
  })];
}

function convertHr() {
  return [new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR } }
  })];
}

const BLOCK_HANDLERS = {
  p: convertParagraph,
  blockquote: convertBlockquote,
  pre: convertPre,
  hr: convertHr
};

/**
 * Converts a block-level HTML element (or a container of them) into docx
 * block components. Generic containers (div/section/body/...) are
 * flattened by recursing into their children. Lists/tables/images
 * (`ul`/`ol`/`table`/`img`) aren't handled yet — Stages 4-6 — and are
 * silently skipped rather than guessed at here.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} options
 * @returns {Array<any>}
 */
export function convertBlock(node, options = {}) {
  if (!node) return [];

  if (node.nodeType === 3) {
    const text = node.text.trim();
    // node-html-parser surfaces a leading <!DOCTYPE ...> as a plain text
    // node rather than a distinct node type -- it's markup, not content.
    if (!text || /^<!doctype/i.test(text)) return [];
    return [new Paragraph({ children: convertInline(node) })];
  }

  if (node.nodeType !== 1) return [];

  const tagName = node.tagName ? node.tagName.toLowerCase() : '';
  if (SKIPPED_TAGS.has(tagName)) return [];

  if (HEADING_LEVELS[tagName]) return convertHeading(node, tagName);

  const handler = BLOCK_HANDLERS[tagName];
  if (handler) return handler(node);

  if (BLOCK_CONTAINER_TAGS.has(tagName) || tagName === '') {
    const blocks = [];
    for (const child of node.childNodes) {
      blocks.push(...convertBlock(child, options));
    }
    return blocks;
  }

  return [];
}
