import { describe, expect, it } from 'vitest';
import { getSvgDimensions, serializeSvg } from '../src/exporter.js';

describe('SVG exporter helpers', () => {
  it('extracts dimensions from viewBox and serializes standalone SVG XML', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 320.5 180.2');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '320');
    rect.setAttribute('height', '180');
    svg.appendChild(rect);

    const dims = getSvgDimensions(svg);
    expect(dims).toEqual({ width: 320.5, height: 180.2 });

    const { markup, width, height } = serializeSvg(svg);
    expect(width).toBe(320.5);
    expect(height).toBe(180.2);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('width="321"');
    expect(markup).toContain('height="181"');
  });
});
