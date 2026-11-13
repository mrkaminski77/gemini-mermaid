import mermaid from 'mermaid';

let renderCounter = 0;
let lastInitializedTheme = null;

/**
 * Determines whether the Gemini web app is currently displaying dark mode.
 *
 * @param {Document} doc
 * @returns {boolean}
 */
export function isDarkMode(doc = document) {
  const html = doc.documentElement;
  const body = doc.body;

  if (
    body?.classList.contains('dark-theme') ||
    body?.classList.contains('dark') ||
    html?.classList.contains('dark-theme') ||
    html?.classList.contains('dark') ||
    html?.getAttribute('data-theme') === 'dark' ||
    body?.getAttribute('data-theme') === 'dark'
  ) {
    return true;
  }

  if (
    body?.classList.contains('light-theme') ||
    html?.classList.contains('light-theme') ||
    html?.getAttribute('data-theme') === 'light'
  ) {
    return false;
  }

  // Fallback: inspect computed background luminance on body
  if (typeof window !== 'undefined' && body) {
    const bg = window.getComputedStyle(body).backgroundColor;
    const match = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      // Ignore fully transparent default in unstyled environments (e.g. jsdom)
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
      }
    }
  }

  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * Initializes Mermaid with strict security and the active theme if needed.
 *
 * @param {boolean} dark
 */
export function ensureMermaidInitialized(dark) {
  const theme = dark ? 'dark' : 'default';
  if (lastInitializedTheme === theme) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
    fontFamily: 'Google Sans, Roboto, Arial, sans-serif'
  });

  lastInitializedTheme = theme;
}

/**
 * Safely parses an SVG markup string into an SVGElement without innerHTML.
 *
 * @param {string} svgMarkup
 * @param {Document} doc
 * @returns {SVGElement}
 */
export function parseSvgMarkup(svgMarkup, doc = document) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const parserError = parsed.querySelector('parsererror');
  if (parserError) {
    throw new Error(`Invalid SVG output from Mermaid: ${parserError.textContent}`);
  }

  const svgRoot = parsed.documentElement;
  if (!svgRoot || svgRoot.tagName.toLowerCase() !== 'svg') {
    throw new Error('Mermaid output did not produce a root <svg> element.');
  }

  return doc.importNode(svgRoot, true);
}

/**
 * Validates and renders Mermaid source into an imported <svg> DOM element.
 *
 * @param {string} source
 * @param {{ dark?: boolean, doc?: Document }} [options]
 * @returns {Promise<{ valid: boolean, svgElement?: SVGElement, dark: boolean, error?: string }>}
 */
export async function renderMermaidSource(source, options = {}) {
  const doc = options.doc || document;
  const dark = typeof options.dark === 'boolean' ? options.dark : isDarkMode(doc);

  ensureMermaidInitialized(dark);

  try {
    const parseResult = await mermaid.parse(source, { suppressErrors: true });
    if (parseResult === false) {
      return { valid: false, dark, error: 'Syntax incomplete or invalid' };
    }
  } catch (err) {
    return {
      valid: false,
      dark,
      error: err instanceof Error ? err.message : String(err)
    };
  }

  try {
    renderCounter += 1;
    const renderId = `gm-mermaid-svg-${renderCounter}`;
    const { svg } = await mermaid.render(renderId, source);
    const svgElement = parseSvgMarkup(svg, doc);
    return { valid: true, svgElement, dark };
  } catch (err) {
    return {
      valid: false,
      dark,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
