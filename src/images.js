import { ImageRun } from 'docx';

// Default timeout and size limits
const FETCH_TIMEOUT_MS = 5000;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Translates MIME type or URL path to explicit ImageRun type extension.
 * @param {string} mimeTypeOrUrl 
 * @returns {string}
 */
export function getImageType(mimeTypeOrUrl) {
  const mimeToType = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
  };

  const clean = (mimeTypeOrUrl || '').trim().toLowerCase();
  if (clean.startsWith('image/')) {
    return mimeToType[clean] || 'png';
  }

  // Fallback to URL extension parsing
  const parts = clean.split('/');
  const lastPart = parts[parts.length - 1];
  const ext = lastPart.split('.').pop().toLowerCase().split(/[?#]/)[0];

  const extToType = {
    'png': 'png',
    'jpg': 'jpg',
    'jpeg': 'jpg',
    'gif': 'gif',
    'bmp': 'bmp',
    'svg': 'svg'
  };
  return extToType[ext] || 'png';
}

/**
 * Decodes a base64 data URI synchronously.
 * @param {string} src 
 * @returns {Object|null}
 */
function decodeDataUri(src) {
  const match = src.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (match) {
    const mimeType = match[1];
    const base64Data = match[2];
    return {
      buffer: Buffer.from(base64Data.trim(), 'base64'),
      mimeType
    };
  }
  return null;
}

/**
 * Parses numeric dimension in pixels from CSS or HTML attribute string.
 * @param {string|number} val 
 * @param {number} defaultVal 
 * @returns {number}
 */
function parseDimension(val, defaultVal = 300) {
  if (!val) return defaultVal;
  const clean = String(val).trim().toLowerCase();
  const num = parseFloat(clean);
  if (isNaN(num)) return defaultVal;

  if (clean.endsWith('px') || /^\d+$/.test(clean)) {
    return num;
  }
  if (clean.endsWith('pt')) {
    return num * 1.333; // 1pt = 1.333px
  }
  if (clean.endsWith('%')) {
    // Treat as percentage of standard page printable width (~600px at 96 DPI)
    return (num / 100) * 600;
  }
  return num;
}

/**
 * Fetches remote image URL with a timeout.
 * @param {string} url 
 * @param {Object} options 
 * @param {number} timeoutMs 
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Pre-fetches all remote images in parallel and caches them in options.
 * @param {import('node-html-parser').HTMLElement} root
 * @returns {Promise<Object>} Map of src -> { buffer, mimeType }
 */
export async function prefetchImages(root) {
  const imageBuffers = {};
  if (!root) return imageBuffers;

  const imgNodes = root.querySelectorAll('img');
  const fetchPromises = imgNodes.map(async (node) => {
    const src = node.getAttribute('src');
    if (!src) return;

    // Skip data URIs (handled synchronously during conversion)
    if (src.startsWith('data:')) return;

    if (src.startsWith('http://') || src.startsWith('https://')) {
      try {
        const response = await fetchWithTimeout(src, {}, FETCH_TIMEOUT_MS);
        if (!response.ok) {
          console.warn(`Warning: Failed to fetch image from ${src}: HTTP ${response.status}`);
          return;
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
          console.warn(`Warning: Image from ${src} is too large (> 5MB)`);
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
          console.warn(`Warning: Image from ${src} is too large (> 5MB)`);
          return;
        }

        imageBuffers[src] = {
          buffer: Buffer.from(arrayBuffer),
          mimeType: response.headers.get('content-type') || src
        };
      } catch (err) {
        console.warn(`Warning: Failed to fetch image from ${src}: ${err.message}`);
      }
    }
  });

  await Promise.all(fetchPromises);
  return imageBuffers;
}

/**
 * Converts HTML <img> node into a docx ImageRun.
 * Supports base64 data URIs and cached remote images.
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} options
 * @returns {Array<ImageRun>}
 */
export function convertImage(node, options = {}) {
  if (!node || node.nodeType !== 1) return [];

  const src = node.getAttribute('src');
  if (!src) {
    console.warn('Warning: <img> tag is missing src attribute');
    return [];
  }

  let bufferData = null;
  let mimeType = '';

  // 1. Handle base64 Data URIs
  if (src.startsWith('data:')) {
    const decoded = decodeDataUri(src);
    if (decoded) {
      bufferData = decoded.buffer;
      mimeType = decoded.mimeType;
    }
  } else {
    // 2. Handle cached remote image
    const cached = options.imageBuffers && options.imageBuffers[src];
    if (cached) {
      bufferData = cached.buffer;
      mimeType = cached.mimeType;
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      console.warn(`Warning: Skipped remote image from ${src} (not pre-fetched or fetch failed)`);
      return [];
    }
  }

  if (!bufferData) return [];

  // 3. Resolve and scale dimensions
  const styleWidth = node.computedStyle && node.computedStyle.width;
  const styleHeight = node.computedStyle && node.computedStyle.height;
  const attrWidth = node.getAttribute('width');
  const attrHeight = node.getAttribute('height');

  const wVal = styleWidth || attrWidth;
  const hVal = styleHeight || attrHeight;

  let width = null;
  let height = null;

  if (wVal && hVal) {
    width = parseDimension(wVal);
    height = parseDimension(hVal);
  } else if (wVal) {
    width = parseDimension(wVal);
    height = width * 0.75; // fallback aspect ratio 4:3
  } else if (hVal) {
    height = parseDimension(hVal);
    width = height / 0.75;
  } else {
    width = 300;
    height = 200;
  }

  // 4. Resolve image type extension
  const type = getImageType(mimeType || src);

  try {
    const run = new ImageRun({
      data: bufferData,
      transformation: {
        width,
        height
      },
      type
    });
    return [run];
  } catch (err) {
    console.warn(`Warning: Failed to create ImageRun for image ${src}: ${err.message}`);
    return [];
  }
}
