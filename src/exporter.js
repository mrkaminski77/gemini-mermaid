/**
 * SVG and 2x HiDPI PNG export utilities for rendered Mermaid diagrams.
 */

const DEFAULT_LIGHT_BG = '#ffffff';
const DEFAULT_DARK_BG = '#1e1f20';

/**
 * Extracts explicit pixel dimensions for an SVG element.
 *
 * @param {SVGElement} svgElement
 * @returns {{ width: number, height: number }}
 */
export function getSvgDimensions(svgElement) {
  const viewBox = svgElement.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const attrW = parseFloat(svgElement.getAttribute('width') || '');
  const attrH = parseFloat(svgElement.getAttribute('height') || '');
  if (Number.isFinite(attrW) && attrW > 0 && Number.isFinite(attrH) && attrH > 0) {
    return { width: attrW, height: attrH };
  }

  const rect = typeof svgElement.getBoundingClientRect === 'function'
    ? svgElement.getBoundingClientRect()
    : { width: 800, height: 600 };

  return {
    width: rect.width > 0 ? rect.width : 800,
    height: rect.height > 0 ? rect.height : 600
  };
}

/**
 * Serializes an SVGElement to a standalone SVG XML string.
 *
 * @param {SVGElement} svgElement
 * @returns {{ markup: string, width: number, height: number }}
 */
export function serializeSvg(svgElement) {
  const clone = svgElement.cloneNode(true);
  const { width, height } = getSvgDimensions(svgElement);

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(Math.ceil(width)));
  clone.setAttribute('height', String(Math.ceil(height)));

  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const serializer = new XMLSerializer();
  const markup = serializer.serializeToString(clone);

  return { markup, width, height };
}

/**
 * Triggers a browser file download for a Blob.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Downloads the rendered diagram as an .svg file.
 *
 * @param {SVGElement} svgElement
 * @param {string} [filename]
 */
export function downloadSVG(svgElement, filename = 'gemini-mermaid-diagram.svg') {
  const { markup } = serializeSvg(svgElement);
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  triggerBlobDownload(blob, filename);
}

/**
 * Converts an SVGElement into a 2x HiDPI PNG Blob with a solid theme background.
 *
 * @param {SVGElement} svgElement
 * @param {boolean} isDark
 * @param {number} [scale]
 * @returns {Promise<Blob>}
 */
export function svgToPngBlob(svgElement, isDark, scale = 2) {
  const { markup, width, height } = serializeSvg(svgElement);
  const targetWidth = Math.max(1, Math.ceil(width * scale));
  const targetHeight = Math.max(1, Math.ceil(height * scale));

  // Encode as base64 data URL rather than Blob URL to avoid tainted canvas issues
  const base64 = btoa(unescape(encodeURIComponent(markup)));
  const dataUrl = `data:image/svg+xml;base64,${base64}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to acquire 2D canvas context.'));
          return;
        }

        ctx.fillStyle = isDark ? DEFAULT_DARK_BG : DEFAULT_LIGHT_BG;
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas failed to export PNG blob.'));
          }
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      reject(new Error('Failed to load SVG into Image for PNG export.'));
    };
    img.src = dataUrl;
  });
}

/**
 * Downloads the rendered diagram as a 2x HiDPI .png file.
 *
 * @param {SVGElement} svgElement
 * @param {boolean} isDark
 * @param {string} [filename]
 * @returns {Promise<void>}
 */
export async function downloadPNG(
  svgElement,
  isDark,
  filename = 'gemini-mermaid-diagram.png'
) {
  const blob = await svgToPngBlob(svgElement, isDark);
  triggerBlobDownload(blob, filename);
}

/**
 * Copies the rendered diagram as a PNG image to the system clipboard.
 *
 * @param {SVGElement} svgElement
 * @param {boolean} isDark
 * @returns {Promise<void>}
 */
export async function copyPNGToClipboard(svgElement, isDark) {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image write is not supported in this browser context.');
  }

  const blob = await svgToPngBlob(svgElement, isDark);
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}
