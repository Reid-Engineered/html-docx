/**
 * CSS Cascade and Inheritance Engine for html2docx.
 */

const INHERITABLE_PROPERTIES = [
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration'
];

/**
 * Calculates selector specificity (ID: 100, Class: 10, Tag: 1).
 * @param {string} selector
 * @returns {number}
 */
export function calculateSpecificity(selector) {
  if (selector === '*') return 0;
  
  let spec = 0;
  // Match IDs
  const ids = selector.match(/#[a-zA-Z0-9_-]+/g);
  if (ids) spec += ids.length * 100;
  
  // Match Classes
  const classes = selector.match(/\.[a-zA-Z0-9_-]+/g);
  if (classes) spec += classes.length * 10;
  
  // Match Tags (remove IDs and Classes first)
  let cleanSelector = selector;
  if (ids) ids.forEach(id => cleanSelector = cleanSelector.replace(id, ''));
  if (classes) classes.forEach(cls => cleanSelector = cleanSelector.replace(cls, ''));
  
  const tags = cleanSelector.match(/[a-zA-Z0-9_-]+/g);
  if (tags) spec += tags.length * 1;
  
  return spec;
}

/**
 * Checks if a DOM node matches a CSS selector.
 * Supports: *, tag, .class, #id, tag.class, tag#id.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {string} selector
 * @returns {boolean}
 */
export function matchesSelector(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  
  if (selector === '*') return true;
  
  const tagName = node.tagName ? node.tagName.toLowerCase() : '';
  const classAttr = node.getAttribute('class') || '';
  const classes = classAttr.split(/\s+/).filter(Boolean);
  const idAttr = node.getAttribute('id') || '';
  
  if (selector.startsWith('#')) {
    return idAttr === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return classes.includes(selector.slice(1));
  }
  
  // Combined tag.class / tag#id / tag
  const dotIndex = selector.indexOf('.');
  const hashIndex = selector.indexOf('#');
  
  if (dotIndex !== -1) {
    const tagPart = selector.slice(0, dotIndex);
    const classPart = selector.slice(dotIndex + 1);
    const tagMatches = !tagPart || tagName === tagPart.toLowerCase();
    const classMatches = classes.includes(classPart);
    return tagMatches && classMatches;
  }
  
  if (hashIndex !== -1) {
    const tagPart = selector.slice(0, hashIndex);
    const idPart = selector.slice(hashIndex + 1);
    const tagMatches = !tagPart || tagName === tagPart.toLowerCase();
    const idMatches = idAttr === idPart;
    return tagMatches && idMatches;
  }
  
  return tagName === selector.toLowerCase();
}

/**
 * Parses CSS text block into selector-property rules.
 * @param {string} cssText
 * @returns {Array<Object>}
 */
export function parseCssRules(cssText) {
  const rules = [];
  const cleanCss = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  
  const ruleRegex = /\s*([^{]+?)\s*\{\s*([^}]+?)\s*\}/g;
  let match;
  while ((match = ruleRegex.exec(cleanCss)) !== null) {
    const selectors = match[1].split(',').map(s => s.trim());
    const propBlock = match[2].trim();
    
    const declarations = {};
    const propRegex = /([\w-]+)\s*:\s*([^;]+)/g;
    let propMatch;
    while ((propMatch = propRegex.exec(propBlock)) !== null) {
      const name = propMatch[1].trim().toLowerCase();
      const value = propMatch[2].trim();
      declarations[name] = value;
    }
    
    for (const selector of selectors) {
      if (selector) {
        rules.push({
          selector,
          declarations,
          specificity: calculateSpecificity(selector)
        });
      }
    }
  }
  return rules;
}

/**
 * Parse style attributes into declarations.
 * @param {string} styleStr
 * @returns {Object}
 */
export function parseInlineStyle(styleStr) {
  if (!styleStr) return {};
  const styles = {};
  const propRegex = /([\w-]+)\s*:\s*([^;]+)/g;
  let match;
  while ((match = propRegex.exec(styleStr)) !== null) {
    const name = match[1].trim().toLowerCase();
    const value = match[2].trim();
    styles[name] = value;
  }
  return styles;
}

/**
 * Converts any CSS size string (px, pt, em, rem, %) to points (pt).
 * @param {string|number} sizeStr
 * @param {number} relativeToPt Reference point size for relative calculations
 * @returns {number}
 */
export function parseToPoints(sizeStr, relativeToPt = 12) {
  if (typeof sizeStr === 'number') return sizeStr;
  if (!sizeStr) return relativeToPt;
  
  const trimStr = sizeStr.trim().toLowerCase();
  
  const namedSizes = {
    'xx-small': 7,
    'x-small': 9,
    'small': 10,
    'medium': 12,
    'large': 14,
    'x-large': 18,
    'xx-large': 24
  };
  if (namedSizes[trimStr] !== undefined) {
    return namedSizes[trimStr];
  }
  
  const num = parseFloat(trimStr);
  if (isNaN(num)) return relativeToPt;
  
  if (trimStr.endsWith('pt')) {
    return num;
  }
  if (trimStr.endsWith('px')) {
    return num * 0.75;
  }
  if (trimStr.endsWith('em')) {
    return num * relativeToPt;
  }
  if (trimStr.endsWith('%')) {
    return (num / 100) * relativeToPt;
  }
  if (trimStr.endsWith('rem')) {
    // Relative to default root font size (12pt)
    return num * 12;
  }
  
  return num;
}

/**
 * Resolves font size string relative to parent size and root size.
 * Returns value as a pt string (e.g. "14pt").
 * @param {string} sizeStr
 * @param {string|number} parentSize
 * @param {string|number} rootSize
 * @returns {string}
 */
export function resolveFontSize(sizeStr, parentSize = '12pt', rootSize = '12pt') {
  const rootPt = typeof rootSize === 'number' ? rootSize : parseToPoints(rootSize, 12);
  const parentPt = typeof parentSize === 'number' ? parentSize : parseToPoints(parentSize, rootPt);
  
  const trimStr = sizeStr.trim().toLowerCase();
  if (trimStr.endsWith('rem')) {
    const num = parseFloat(trimStr);
    return `${num * rootPt}pt`;
  }
  
  const valPt = parseToPoints(sizeStr, parentPt);
  return `${valPt}pt`;
}

/**
 * Parses all <style> blocks in the DOM tree.
 * @param {import('node-html-parser').HTMLElement} rootNode
 * @returns {Array<Object>}
 */
export function parseDocumentStyles(rootNode) {
  const rules = [];
  let index = 0;
  
  const styleNodes = rootNode.querySelectorAll('style');
  for (const styleNode of styleNodes) {
    const cssText = styleNode.textContent;
    const parsedRules = parseCssRules(cssText);
    for (const rule of parsedRules) {
      rules.push({
        ...rule,
        index: index++
      });
    }
  }
  
  return rules;
}

/**
 * Resolves the computed style for a single node.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} parentStyle
 * @param {Array<Object>} globalRules
 * @param {number} rootFontSizePt
 * @param {string|null} theme
 * @returns {Object}
 */
export function getComputedStyle(node, parentStyle = {}, globalRules = [], rootFontSizePt = 12, theme = null) {
  if (!node || node.nodeType !== 1) return {};
  
  const computed = {};
  
  // 1. Inherit properties from parent
  for (const prop of INHERITABLE_PROPERTIES) {
    if (parentStyle[prop] !== undefined) {
      computed[prop] = parentStyle[prop];
    }
  }
  
  // 2. Apply matching global CSS rules
  const matchingRules = globalRules.filter(rule => matchesSelector(node, rule.selector));
  
  // Sort by specificity, then by index (source order)
  matchingRules.sort((a, b) => {
    if (a.specificity !== b.specificity) {
      return a.specificity - b.specificity;
    }
    return a.index - b.index;
  });
  
  for (const rule of matchingRules) {
    for (const [name, value] of Object.entries(rule.declarations)) {
      computed[name] = value;
    }
  }
  
  // 3. Apply inline styles
  const inlineStyleStr = node.getAttribute('style');
  if (inlineStyleStr) {
    const inlineDeclarations = parseInlineStyle(inlineStyleStr);
    for (const [name, value] of Object.entries(inlineDeclarations)) {
      computed[name] = value;
    }
  }
  
  // 3.5 Expand CSS shorthands (font, background)
  expandShorthands(computed);
  
  // 4. Resolve relative font size (em/rem/%)
  if (computed['font-size']) {
    computed['font-size'] = resolveFontSize(
      computed['font-size'],
      parentStyle['font-size'] || `${rootFontSizePt}pt`,
      `${rootFontSizePt}pt`
    );
  }
  
  // 5. Apply theme override (highest priority)
  if (theme) {
    applyThemeOverride(node, computed, theme);
  }
  
  return computed;
}

/**
 * Walks the DOM tree and resolves/attaches computed styles to all nodes.
 * @param {import('node-html-parser').HTMLElement} rootNode
 * @param {string|number} defaultRootFontSize Default root font size
 * @param {string|null} theme
 */
export function applyStylesToTree(rootNode, defaultRootFontSize = '12pt', theme = null) {
  const globalRules = parseDocumentStyles(rootNode);
  const rootPt = parseToPoints(defaultRootFontSize, 12);
  
  function walk(node, parentStyle = {}) {
    if (node.nodeType === 1) {
      const computed = getComputedStyle(node, parentStyle, globalRules, rootPt, theme);
      node.computedStyle = computed;
      
      for (const child of node.childNodes) {
        walk(child, computed);
      }
    } else {
      for (const child of node.childNodes) {
        walk(child, parentStyle);
      }
    }
  }
  
  walk(rootNode, {});
}

// Sizer/Shorthand parser helper implementations
export function parseFontShorthand(fontStr) {
  const result = {};
  if (!fontStr) return result;
  
  const val = fontStr.trim().replace(/\s+/g, ' ');
  
  // Check for style/weight keywords
  if (val.includes('italic') || val.includes('oblique')) {
    result['font-style'] = 'italic';
  }
  if (val.includes('bold') || val.includes('bolder')) {
    result['font-weight'] = 'bold';
  }
  
  const weightMatch = val.match(/\b(100|200|300|400|500|600|700|800|900)\b/);
  if (weightMatch) {
    result['font-weight'] = weightMatch[1];
  }
  
  // Find font-size (optionally with line-height)
  const sizeRegex = /\b(\d+(?:\.\d+)?(?:px|pt|em|rem|%)?)\b(?:\/(\d+(?:\.\d+)?(?:px|pt|em|rem|%)?))?/;
  const sizeMatch = val.match(sizeRegex);
  if (sizeMatch) {
    result['font-size'] = sizeMatch[1];
    
    // Font family is usually at the end of the shorthand (everything after font-size)
    const sizeIndex = val.indexOf(sizeMatch[0]);
    const familyPart = val.slice(sizeIndex + sizeMatch[0].length).trim();
    if (familyPart) {
      result['font-family'] = familyPart;
    }
  }
  
  return result;
}

export function parseBackgroundShorthand(bgStr) {
  const result = {};
  if (!bgStr) return result;
  
  // Look for hex colors, rgb, rgba
  const hexMatch = bgStr.match(/(#[a-fA-F0-9]{3,8})/);
  if (hexMatch) {
    result['background-color'] = hexMatch[1];
    return result;
  }
  
  const rgbMatch = bgStr.match(/(rgba?\(.*?\))/i);
  if (rgbMatch) {
    result['background-color'] = rgbMatch[1];
    return result;
  }
  
  // Single word named colors
  const words = bgStr.split(/\s+/);
  if (words.length === 1 && !words[0].includes('url') && !words[0].includes('gradient')) {
    result['background-color'] = words[0];
  }
  
  return result;
}

export function expandShorthands(styles) {
  if (styles['font']) {
    const expandedFont = parseFontShorthand(styles['font']);
    Object.assign(styles, expandedFont);
  }
  if (styles['background']) {
    const expandedBg = parseBackgroundShorthand(styles['background']);
    Object.assign(styles, expandedBg);
  }
  return styles;
}

// Named themes overrides
const THEMES = {
  modern: {
    fontFamily: 'Arial',
    headingColor: '#0066cc',
    bodyColor: '#333333'
  },
  classic: {
    fontFamily: 'Times New Roman',
    headingColor: '#000000',
    bodyColor: '#111111'
  },
  dark: {
    fontFamily: 'Segoe UI',
    headingColor: '#ffffff',
    bodyColor: '#e0e0e0',
    backgroundColor: '#1e1e1e'
  },
  creative: {
    fontFamily: 'Georgia',
    headingColor: '#800080',
    bodyColor: '#2b2b2b'
  }
};

function applyThemeOverride(node, computed, themeName) {
  const activeTheme = THEMES[themeName.toLowerCase()];
  if (!activeTheme) return;
  
  const tagName = node.tagName ? node.tagName.toLowerCase() : '';
  const isHeading = tagName.startsWith('h') && tagName.length === 2 && !isNaN(parseInt(tagName[1], 10));
  
  if (activeTheme.fontFamily) {
    computed['font-family'] = activeTheme.fontFamily;
  }
  
  if (isHeading && activeTheme.headingColor) {
    computed['color'] = activeTheme.headingColor;
  } else if (!isHeading && activeTheme.bodyColor) {
    const contentTags = new Set(['p', 'span', 'li', 'blockquote', 'div', 'body', 'html', 'pre', 'td', 'th']);
    if (contentTags.has(tagName) || tagName === '') {
      computed['color'] = activeTheme.bodyColor;
    }
  }
  
  if ((tagName === 'body' || tagName === 'html') && activeTheme.backgroundColor) {
    computed['background-color'] = activeTheme.backgroundColor;
  }
}
