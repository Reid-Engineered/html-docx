import { TextRun, ExternalHyperlink, ShadingType } from 'docx';
import { cssColorToHex } from './color.js';
import { convertImage } from './images.js';

const BOLD_TAGS = new Set(['b', 'strong']);
const ITALIC_TAGS = new Set(['i', 'em']);
const UNDERLINE_TAGS = new Set(['u']);
const STRIKE_TAGS = new Set(['s', 'strike', 'del']);
const CODE_TAGS = new Set(['code']);

const CODE_FONT = 'Courier New';
const CODE_SHADING_FILL = 'EDEDED';

export const BASE_PROPS = Object.freeze({
  bold: false,
  italics: false,
  underline: false,
  strike: false,
  isCode: false,
  insideHyperlink: false,
  font: undefined,
  color: undefined,
  size: undefined,
  shading: undefined
});

/**
 * `font-weight: bold` / `bolder` / numeric >= 600 -> bold.
 * @param {string} [weight]
 * @returns {boolean}
 */
function isBoldWeight(weight) {
  if (!weight) return false;
  const w = String(weight).trim().toLowerCase();
  if (w === 'bold' || w === 'bolder') return true;
  const num = parseInt(w, 10);
  return !isNaN(num) && num >= 600;
}

/**
 * `font-style: italic` / `oblique` -> italics.
 * @param {string} [style]
 * @returns {boolean}
 */
function isItalicStyle(style) {
  if (!style) return false;
  const s = style.trim().toLowerCase();
  return s === 'italic' || s === 'oblique';
}

/**
 * @param {string} [decoration] e.g. "underline line-through"
 * @param {string} keyword
 * @returns {boolean}
 */
function hasDecoration(decoration, keyword) {
  if (!decoration) return false;
  return decoration.toLowerCase().split(/\s+/).includes(keyword);
}

/**
 * Resolved font sizes come out of style.js as pt strings (e.g. "14pt").
 * docx `TextRun.size` is in half-points.
 * @param {string} [ptStr]
 * @returns {number|undefined}
 */
function ptStringToHalfPoints(ptStr) {
  if (!ptStr) return undefined;
  const num = parseFloat(ptStr);
  if (isNaN(num)) return undefined;
  return Math.round(num * 2);
}

function firstFontFamily(fontFamily) {
  return fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Combines the formatting state inherited from ancestors with this node's
 * own tag semantics and resolved CSS. Tag semantics (e.g. `<strong>` ->
 * bold) and CSS both contribute; either can turn a property on, matching
 * how nested tags like `<em><strong>` or CSS classes stack in a browser.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} computedStyle
 * @param {Object} inherited
 * @returns {Object}
 */
export function resolveRunProps(node, computedStyle, inherited) {
  const tagName = node.tagName ? node.tagName.toLowerCase() : '';
  const isCode = inherited.isCode || CODE_TAGS.has(tagName);

  const bold = inherited.bold || BOLD_TAGS.has(tagName) || isBoldWeight(computedStyle['font-weight']);
  const italics = inherited.italics || ITALIC_TAGS.has(tagName) || isItalicStyle(computedStyle['font-style']);
  const underline = inherited.underline || UNDERLINE_TAGS.has(tagName) ||
    hasDecoration(computedStyle['text-decoration'], 'underline');
  const strike = inherited.strike || STRIKE_TAGS.has(tagName) ||
    hasDecoration(computedStyle['text-decoration'], 'line-through');

  let font = inherited.font;
  if (isCode) font = CODE_FONT;
  if (computedStyle['font-family']) font = firstFontFamily(computedStyle['font-family']);

  let color = inherited.color;
  if (computedStyle['color']) {
    const hex = cssColorToHex(computedStyle['color']);
    if (hex) color = hex;
  }

  let size = inherited.size;
  const halfPoints = ptStringToHalfPoints(computedStyle['font-size']);
  if (halfPoints !== undefined) size = halfPoints;

  let shading = inherited.shading;
  if (isCode) shading = { fill: CODE_SHADING_FILL, type: ShadingType.CLEAR, color: 'auto' };
  if (computedStyle['background-color']) {
    const hex = cssColorToHex(computedStyle['background-color']);
    if (hex) shading = { fill: hex, type: ShadingType.CLEAR, color: 'auto' };
  }

  return {
    bold, italics, underline, strike, isCode, font, color, size, shading,
    insideHyperlink: inherited.insideHyperlink
  };
}

/**
 * @param {Object} props
 * @param {string} text
 * @returns {Object} IRunOptions
 */
function buildRunOptions(props, text) {
  const options = { text };
  if (props.insideHyperlink) options.style = 'Hyperlink';
  if (props.bold) options.bold = true;
  if (props.italics) options.italics = true;
  if (props.underline) options.underline = {};
  if (props.strike) options.strike = true;
  if (props.font) options.font = props.font;
  if (props.color) options.color = props.color;
  if (props.size !== undefined) options.size = props.size;
  if (props.shading) options.shading = props.shading;
  return options;
}

/**
 * Handles an element node's own tag/CSS-derived formatting and recurses
 * into its children, returning a flat run list. `<a href>` wraps its
 * children's runs in a real ExternalHyperlink; everything else just
 * threads its resolved formatting down to descendants.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} computedStyle
 * @param {Object} inherited
 * @returns {Array<TextRun|ExternalHyperlink>}
 */
function collectElementRuns(node, computedStyle, inherited, options = {}) {
  const tagName = node.tagName ? node.tagName.toLowerCase() : '';

  if (tagName === 'br') {
    return [new TextRun({ break: 1 })];
  }

  if (tagName === 'img') {
    return convertImage(node, options);
  }

  const props = resolveRunProps(node, computedStyle, inherited);

  if (tagName === 'a') {
    const href = node.getAttribute('href');
    const childProps = href ? { ...props, insideHyperlink: true } : props;
    const children = [];
    for (const child of node.childNodes) {
      children.push(...collectRuns(child, childProps, options));
    }
    if (!href) return children;
    return [new ExternalHyperlink({ link: href, children })];
  }

  const runs = [];
  for (const child of node.childNodes) {
    runs.push(...collectRuns(child, props, options));
  }
  return runs;
}

/**
 * Recursively walks a node's subtree (using each element's own
 * `node.computedStyle`, attached by style.js), producing a flat list of
 * docx TextRun / ExternalHyperlink objects.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} inherited
 * @param {Object} options
 * @returns {Array<TextRun|ExternalHyperlink>}
 */
function collectRuns(node, inherited, options = {}) {
  if (node.nodeType === 3) {
    const text = node.text.replace(/\s+/g, ' ');
    if (text === '') return [];
    return [new TextRun(buildRunOptions(inherited, text))];
  }

  if (node.nodeType !== 1) return [];

  return collectElementRuns(node, node.computedStyle || {}, inherited, options);
}

/**
 * Converts an inline-level HTML element (or text node) to docx inline
 * components (TextRun / ExternalHyperlink), recursing through any nested
 * markup and merging tag semantics with resolved CSS along the way.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} [computedStyle] Defaults to `node.computedStyle`. Only
 *   applies to `node` itself; descendants always use their own
 *   `node.computedStyle` as attached by `applyStylesToTree`.
 * @param {Object} [options]
 * @param {Object} [options.inherited] Formatting state inherited from an
 *   ancestor not represented in the DOM passed here (rarely needed).
 * @returns {Array<TextRun|ExternalHyperlink>}
 */
export function convertInline(node, computedStyle, options = {}) {
  if (!node) return [];
  const inherited = options.inherited || BASE_PROPS;

  if (node.nodeType === 3) {
    return collectRuns(node, inherited, options);
  }

  if (node.nodeType !== 1) return [];

  const style = computedStyle !== undefined ? computedStyle : (node.computedStyle || {});
  return collectElementRuns(node, style, inherited, options);
}
