import { beforeEach, describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import { isDarkMode, parseSvgMarkup } from '../src/renderer.js';

describe('renderer utilities & real mermaid parser', () => {
  beforeEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
    document.body.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('detects light and dark theme classes/attributes', () => {
    expect(isDarkMode(document)).toBe(false);

    document.body.classList.add('dark-theme');
    expect(isDarkMode(document)).toBe(true);

    document.body.classList.remove('dark-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(isDarkMode(document)).toBe(true);
  });

  it('safely parses valid SVG markup into an SVGElement', () => {
    const svgEl = parseSvgMarkup(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>',
      document
    );
    expect(svgEl.tagName.toLowerCase()).toBe('svg');
    expect(svgEl.getAttribute('viewBox')).toBe('0 0 100 50');
  });

  it('validates real Mermaid syntax via mermaid.parse()', async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    const valid = await mermaid.parse('flowchart TD\n  A[Start] --> B[End]', {
      suppressErrors: true
    });
    expect(valid).not.toBe(false);

    const invalid = await mermaid.parse('flowchart TD\n  A -->', {
      suppressErrors: true
    });
    expect(invalid).toBe(false);
  });
});
