import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMermaidObserver } from '../src/observer.js';
import { getCardController, getOrCreateCardController } from '../src/ui.js';

function createMockSvg(doc = document) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 100');
  const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '200');
  rect.setAttribute('height', '100');
  svg.appendChild(rect);
  return svg;
}

describe('Interactive UI card & observer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('mounts Diagram/Code toggle, switches views, and supports pan & zoom', () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block-decoration"><span>mermaid</span></div>
        <div class="formatted-code-block-internal-container">
          <pre><code class="language-mermaid">flowchart TD\n  A --> B</code></pre>
        </div>
      </code-block>
    `;

    const container = document.querySelector('code-block');
    const codeTarget = container.querySelector('.formatted-code-block-internal-container');
    const controller = getOrCreateCardController(container);

    controller.showDiagram(createMockSvg(), false);

    // Defaults to Diagram view with original code hidden
    expect(controller.state.mode).toBe('diagram');
    expect(codeTarget.classList.contains('gm-code-hidden')).toBe(true);
    expect(controller.wrapper.querySelector('.gm-canvas svg')).not.toBeNull();

    // Switch to Code tab
    const codeTab = controller.wrapper.querySelectorAll('.gm-tab-btn')[1];
    codeTab.click();
    expect(controller.state.mode).toBe('code');
    expect(codeTarget.classList.contains('gm-code-hidden')).toBe(false);
    expect(controller.wrapper.querySelector('.gm-viewport').classList.contains('gm-hidden')).toBe(true);

    // Switch back to Diagram tab
    const diagramTab = controller.wrapper.querySelectorAll('.gm-tab-btn')[0];
    diagramTab.click();
    expect(controller.state.mode).toBe('diagram');
    expect(codeTarget.classList.contains('gm-code-hidden')).toBe(true);

    // Zoom in, wheel zoom, pan, and reset
    const zoomInBtn = controller.wrapper.querySelector('button[title="Zoom in"]');
    const zoomOutBtn = controller.wrapper.querySelector('button[title="Zoom out"]');
    const zoomResetBtn = controller.wrapper.querySelector('.gm-zoom-label');

    zoomInBtn.click();
    expect(controller.state.scale).toBe(1.2);
    expect(zoomResetBtn.textContent).toBe('120%');

    zoomOutBtn.click();
    expect(controller.state.scale).toBe(1);
    expect(zoomResetBtn.textContent).toBe('100%');

    const viewport = controller.wrapper.querySelector('.gm-viewport');
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 50, clientY: 50, cancelable: true }));
    expect(controller.state.scale).toBe(1.2);

    // Reset before drag pan test so pan starts from 0,0
    zoomResetBtn.click();
    expect(controller.state.scale).toBe(1);
    expect(controller.state.panX).toBe(0);
    expect(controller.state.panY).toBe(0);

    // Drag pan
    viewport.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 100, clientY: 100 }));
    viewport.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 125 }));
    viewport.dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 125 }));
    expect(controller.state.panX).toBe(40);
    expect(controller.state.panY).toBe(25);

    // Reset button restores 100% scale and 0,0 pan
    zoomResetBtn.click();
    expect(controller.state.scale).toBe(1);
    expect(controller.state.panX).toBe(0);
    expect(controller.state.panY).toBe(0);
    expect(zoomResetBtn.textContent).toBe('100%');
  });

  it('keeps Code view visible during streaming invalid syntax and switches to Diagram once valid', async () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block-decoration"><span>mermaid</span></div>
        <pre><code class="language-mermaid">flowchart TD\n  A --></code></pre>
      </code-block>
    `;

    const renderFn = vi
      .fn()
      .mockResolvedValueOnce({ valid: false, dark: false, error: 'Incomplete' })
      .mockResolvedValueOnce({ valid: true, svgElement: createMockSvg(), dark: false });

    const observer = createMermaidObserver({
      doc: document,
      root: document.body,
      debounceMs: 10,
      renderFn
    });

    const container = document.querySelector('code-block');
    await observer.processContainer(container);

    const controller = getCardController(container);
    expect(controller).not.toBeNull();
    expect(controller.state.mode).toBe('code');
    expect(controller.wrapper.querySelector('.gm-status-badge').classList.contains('gm-hidden')).toBe(false);

    // Simulate streaming completion
    container.querySelector('code').textContent = 'flowchart TD\n  A --> B';
    await observer.processContainer(container);

    expect(controller.state.mode).toBe('diagram');
    expect(controller.wrapper.querySelector('.gm-status-badge').classList.contains('gm-hidden')).toBe(true);
    expect(controller.wrapper.querySelector('.gm-canvas svg')).not.toBeNull();
  });

  it('re-renders active diagrams when Gemini theme switches to dark mode', async () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block-decoration"><span>mermaid</span></div>
        <pre><code class="language-mermaid">flowchart TD\n  A --> B</code></pre>
      </code-block>
    `;

    const renderFn = vi.fn(async (_source, opts) => ({
      valid: true,
      svgElement: createMockSvg(),
      dark: opts.dark
    }));

    const observer = createMermaidObserver({
      doc: document,
      root: document.body,
      debounceMs: 10,
      renderFn
    });

    const container = document.querySelector('code-block');
    await observer.processContainer(container);
    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(renderFn.mock.calls[0][1].dark).toBe(false);

    document.body.classList.add('dark-theme');
    observer.handleThemeChange();
    await Promise.resolve();

    expect(renderFn).toHaveBeenCalledTimes(2);
    expect(renderFn.mock.calls[1][1].dark).toBe(true);
    expect(getCardController(container).wrapper.classList.contains('gm-dark')).toBe(true);
  });
});
