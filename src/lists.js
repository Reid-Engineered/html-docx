import { Paragraph, LevelFormat, AlignmentType } from 'docx';
import { convertInline, resolveRunProps, BASE_PROPS } from './inline.js';

// Alternating templates for bullet lists (ul)
const BULLET_LEVELS_TEMPLATE = [
  { level: 0, format: LevelFormat.BULLET, text: '•' },
  { level: 1, format: LevelFormat.BULLET, text: 'o' },
  { level: 2, format: LevelFormat.BULLET, text: '▪' },
  { level: 3, format: LevelFormat.BULLET, text: '•' },
  { level: 4, format: LevelFormat.BULLET, text: 'o' },
  { level: 5, format: LevelFormat.BULLET, text: '▪' },
  { level: 6, format: LevelFormat.BULLET, text: '•' },
  { level: 7, format: LevelFormat.BULLET, text: 'o' },
  { level: 8, format: LevelFormat.BULLET, text: '▪' }
];

// Alternating templates for decimal lists (ol)
const DECIMAL_LEVELS_TEMPLATE = [
  { level: 0, format: LevelFormat.DECIMAL, text: '%1.' },
  { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.' },
  { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.' },
  { level: 3, format: LevelFormat.DECIMAL, text: '%4.' },
  { level: 4, format: LevelFormat.LOWER_LETTER, text: '%5.' },
  { level: 5, format: LevelFormat.LOWER_ROMAN, text: '%6.' },
  { level: 6, format: LevelFormat.DECIMAL, text: '%7.' },
  { level: 7, format: LevelFormat.LOWER_LETTER, text: '%8.' },
  { level: 8, format: LevelFormat.LOWER_ROMAN, text: '%9.' }
];

/**
 * Helper to generate numbering level configurations with correct indentation.
 * @param {Array<Object>} template 
 * @returns {Array<Object>}
 */
function generateLevelsConfig(template) {
  return template.map(item => ({
    level: item.level,
    format: item.format,
    text: item.text,
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: { left: (item.level + 1) * 720, hanging: 360 }
      }
    }
  }));
}

/**
 * Converts HTML lists (ul/ol) to docx list structures.
 * Generates a unique numbering configuration for each top-level list to ensure correct restart behavior,
 * and maintains the active numbering reference and nesting levels for nested child lists.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} options
 * @returns {Array<Paragraph>}
 */
export function convertList(node, options = {}) {
  if (!node || node.nodeType !== 1) return [];

  const tagName = node.tagName ? node.tagName.toLowerCase() : '';
  if (tagName !== 'ul' && tagName !== 'ol') return [];

  // 1. Initialize numbering configs and counters if not present
  if (!options.numberingConfigs) {
    options.numberingConfigs = [];
  }
  if (options.listCounter === undefined) {
    options.listCounter = 1;
  }

  // 2. Generate a new unique reference for this list (to handle numbering restart)
  const listRef = `${tagName}-list-ref-${options.listCounter++}`;

  // 3. Register numbering configuration
  const template = tagName === 'ul' ? BULLET_LEVELS_TEMPLATE : DECIMAL_LEVELS_TEMPLATE;
  options.numberingConfigs.push({
    reference: listRef,
    levels: generateLevelsConfig(template)
  });

  // 4. Save parent list state to restore later
  const parentRef = options.currentListRef;
  const parentLevel = options.currentListLevel;

  // 5. Update active list reference and level
  const newLevel = options.currentListLevel !== undefined ? options.currentListLevel + 1 : 0;
  options.currentListRef = listRef;
  options.currentListLevel = newLevel;

  const blocks = [];

  // 6. Process child list items (or handle malformed direct child lists)
  for (const child of node.childNodes) {
    if (child.nodeType === 1) {
      const childTag = child.tagName.toLowerCase();
      if (childTag === 'li') {
        blocks.push(...convertListItem(child, options));
      } else if (childTag === 'ul' || childTag === 'ol') {
        // Tolerating malformed HTML where ul/ol is nested directly under parent ul/ol
        blocks.push(...convertList(child, options));
      }
    }
  }

  // 7. Restore parent list state
  options.currentListRef = parentRef;
  options.currentListLevel = parentLevel;

  return blocks;
}

/**
 * Converts a single <li> element into paragraphs.
 * Extracts leading inline contents for the bulleted/numbered paragraph,
 * and processes subsequent block elements (like nested lists) as separate blocks.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} options
 * @returns {Array<Paragraph>}
 */
function convertListItem(node, options) {
  const { inlineNodes, blockNodes } = getListItemContent(node);

  // Convert inline children to runs
  const inherited = resolveRunProps(node, node.computedStyle || {}, BASE_PROPS);
  const runs = [];
  for (const child of inlineNodes) {
    runs.push(...convertInline(child, undefined, { inherited }));
  }

  // Create main list item paragraph
  const liParagraph = new Paragraph({
    numbering: {
      reference: options.currentListRef,
      level: options.currentListLevel
    },
    children: runs
  });

  const blocks = [liParagraph];

  // Process nested blocks (e.g. nested lists or continuation paragraphs)
  for (const block of blockNodes) {
    if (options.convertBlock) {
      blocks.push(...options.convertBlock(block, options));
    }
  }

  return blocks;
}

/**
 * Splits <li> children into inline content (for the bullet paragraph itself)
 * and block content (for nested lists or nested paragraphs).
 * Merges the first child paragraph's inline contents to avoid empty bullets.
 * @param {import('node-html-parser').HTMLElement} liNode
 * @returns {Object}
 */
function getListItemContent(liNode) {
  const inlineNodes = [];
  const blockNodes = [];
  let firstParagraphProcessed = false;

  for (const child of liNode.childNodes) {
    if (child.nodeType === 1) {
      const childTag = child.tagName.toLowerCase();
      if (childTag === 'ul' || childTag === 'ol') {
        blockNodes.push(child);
      } else if (childTag === 'p' || childTag === 'div') {
        if (!firstParagraphProcessed && inlineNodes.length === 0) {
          // Extract inline contents of first paragraph to align with bullet
          for (const subChild of child.childNodes) {
            inlineNodes.push(subChild);
          }
          firstParagraphProcessed = true;
        } else {
          blockNodes.push(child);
        }
      } else {
        // Other inline elements (a, span, strong, em, etc.)
        inlineNodes.push(child);
      }
    } else if (child.nodeType === 3) {
      // Keep non-empty text node, or any text node if we haven't hit blocks
      if (child.text.trim() || blockNodes.length === 0) {
        inlineNodes.push(child);
      }
    }
  }

  return { inlineNodes, blockNodes };
}
