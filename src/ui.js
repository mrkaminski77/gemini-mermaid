import { copyPNGToClipboard, downloadPNG, downloadSVG } from './exporter.js';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4.0;
const ZOOM_STEP = 0.2;

const controllers = new WeakMap();

/**
 * Clamps a numeric value between min and max.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Finds the element representing the code body to toggle visibility on.
 *
 * @param {Element} container
 * @returns {Element|null}
 */
function findCodeTarget(container) {
  if (container.matches('pre')) {
    return container;
  }
  const internal = container.querySelector('.formatted-code-block-internal-container');
  if (internal) {
    return internal;
  }
  return container.querySelector('pre');
}

/**
 * Creates a toolbar button element.
 *
 * @param {string} label
 * @param {string} className
 * @param {string} title
 * @returns {HTMLButtonElement}
 */
function createButton(label, className, title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  if (title) {
    btn.title = title;
    btn.setAttribute('aria-label', title);
  }
  return btn;
}

/**
 * Creates or returns the interactive Mermaid card controller for a code block container.
 *
 * @param {Element} container
 */
export function getOrCreateCardController(container) {
  const existing = controllers.get(container);
  if (existing && existing.wrapper.isConnected) {
    return existing;
  }

  const codeTarget = findCodeTarget(container);
  const wrapper = document.createElement('div');
  wrapper.className = 'gm-mermaid-wrapper';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'gm-toolbar';

  const leftGroup = document.createElement('div');
  leftGroup.className = 'gm-toolbar-group gm-tabs';

  const diagramTab = createButton('Diagram', 'gm-tab-btn gm-active', 'Show rendered diagram');
  const codeTab = createButton('Code', 'gm-tab-btn', 'Show raw Mermaid code');
  const statusBadge = document.createElement('span');
  statusBadge.className = 'gm-status-badge gm-hidden';

  leftGroup.append(diagramTab, codeTab, statusBadge);

  const rightGroup = document.createElement('div');
  rightGroup.className = 'gm-toolbar-group gm-controls';

  const zoomOutBtn = createButton('−', 'gm-ctrl-btn', 'Zoom out');
  const zoomResetBtn = createButton('100%', 'gm-ctrl-btn gm-zoom-label', 'Reset zoom and pan');
  const zoomInBtn = createButton('+', 'gm-ctrl-btn', 'Zoom in');

  const divider = document.createElement('span');
  divider.className = 'gm-divider';

  const svgBtn = createButton('SVG', 'gm-ctrl-btn', 'Download SVG');
  const pngBtn = createButton('PNG', 'gm-ctrl-btn', 'Download PNG');
  const copyPngBtn = createButton('Copy PNG', 'gm-ctrl-btn', 'Copy PNG to clipboard');

  rightGroup.append(
    zoomOutBtn,
    zoomResetBtn,
    zoomInBtn,
    divider,
    svgBtn,
    pngBtn,
    copyPngBtn
  );

  toolbar.append(leftGroup, rightGroup);

  // Viewport & pan/zoom canvas
  const viewport = document.createElement('div');
  viewport.className = 'gm-viewport';

  const canvas = document.createElement('div');
  canvas.className = 'gm-canvas';
  viewport.appendChild(canvas);

  wrapper.append(toolbar, viewport);

  // Mount wrapper right before the code target (or before standalone <pre>)
  if (container.matches('pre')) {
    if (container.parentNode) {
      container.parentNode.insertBefore(wrapper, container);
    }
  } else if (codeTarget && codeTarget.parentNode) {
    codeTarget.parentNode.insertBefore(wrapper, codeTarget);
  } else {
    container.appendChild(wrapper);
  }

  const state = {
    container,
    wrapper,
    codeTarget,
    viewport,
    canvas,
    diagramTab,
    codeTab,
    statusBadge,
    rightGroup,
    zoomResetBtn,
    copyPngBtn,
    mode: 'code', // 'diagram' | 'code'
    userPinnedTab: false,
    hasValidDiagram: false,
    isDark: false,
    svgElement: null,
    scale: 1,
    panX: 0,
    panY: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panStartX: 0,
    panStartY: 0
  };

  function applyTransform() {
    canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
    zoomResetBtn.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function setMode(nextMode, userInitiated = false) {
    if (nextMode === 'diagram' && !state.hasValidDiagram) {
      nextMode = 'code';
    }
    state.mode = nextMode;
    if (userInitiated) {
      state.userPinnedTab = true;
    }

    const showDiagram = nextMode === 'diagram';
    diagramTab.classList.toggle('gm-active', showDiagram);
    codeTab.classList.toggle('gm-active', !showDiagram);
    diagramTab.setAttribute('aria-pressed', String(showDiagram));
    codeTab.setAttribute('aria-pressed', String(!showDiagram));

    viewport.classList.toggle('gm-hidden', !showDiagram);
    rightGroup.classList.toggle('gm-hidden', !showDiagram);

    if (state.codeTarget) {
      state.codeTarget.classList.toggle('gm-code-hidden', showDiagram);
    }
  }

  function resetView() {
    state.scale = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform();
  }

  function zoomBy(delta, focalClientX = null, focalClientY = null) {
    const prevScale = state.scale;
    const nextScale = clamp(Number((prevScale + delta).toFixed(2)), MIN_SCALE, MAX_SCALE);
    if (nextScale === prevScale) return;

    if (focalClientX !== null && focalClientY !== null) {
      const rect = viewport.getBoundingClientRect();
      const offsetX = focalClientX - rect.left - rect.width / 2;
      const offsetY = focalClientY - rect.top - rect.height / 2;
      const ratio = nextScale / prevScale;
      state.panX = offsetX - (offsetX - state.panX) * ratio;
      state.panY = offsetY - (offsetY - state.panY) * ratio;
    }

    state.scale = nextScale;
    applyTransform();
  }

  // Tab handlers
  diagramTab.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.hasValidDiagram) {
      setMode('diagram', true);
    }
  });

  codeTab.addEventListener('click', (e) => {
    e.stopPropagation();
    setMode('code', true);
  });

  // Zoom button handlers
  zoomInBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    zoomBy(ZOOM_STEP);
  });

  zoomOutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    zoomBy(-ZOOM_STEP);
  });

  zoomResetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetView();
  });

  // Wheel zoom
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (state.mode !== 'diagram') return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      zoomBy(step, e.clientX, e.clientY);
    },
    { passive: false }
  );

  // Pointer drag pan
  viewport.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'diagram' || e.button !== 0) return;
    state.dragging = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.panStartX = state.panX;
    state.panStartY = state.panY;
    viewport.classList.add('gm-dragging');
    if (typeof viewport.setPointerCapture === 'function') {
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        // Ignore in synthetic test environments
      }
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    state.panX = state.panStartX + (e.clientX - state.dragStartX);
    state.panY = state.panStartY + (e.clientY - state.dragStartY);
    applyTransform();
  });

  const endDrag = (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    viewport.classList.remove('gm-dragging');
    if (typeof viewport.releasePointerCapture === 'function') {
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // Export handlers
  svgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.svgElement) {
      downloadSVG(state.svgElement);
    }
  });

  pngBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!state.svgElement) return;
    const origText = pngBtn.textContent;
    pngBtn.disabled = true;
    try {
      await downloadPNG(state.svgElement, state.isDark);
    } catch (err) {
      console.error('[gemini-mermaid] PNG export failed:', err);
    } finally {
      pngBtn.disabled = false;
      pngBtn.textContent = origText;
    }
  });

  copyPngBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!state.svgElement) return;
    copyPngBtn.disabled = true;
    try {
      await copyPNGToClipboard(state.svgElement, state.isDark);
      copyPngBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyPngBtn.textContent = 'Copy PNG';
      }, 1500);
    } catch (err) {
      console.error('[gemini-mermaid] Copy PNG failed:', err);
      copyPngBtn.textContent = 'Failed';
      setTimeout(() => {
        copyPngBtn.textContent = 'Copy PNG';
      }, 1500);
    } finally {
      copyPngBtn.disabled = false;
    }
  });

  const controller = {
    wrapper,
    state,
    applyTransform,
    resetView,
    zoomBy,
    setMode,

    /**
     * Updates the card with a newly rendered SVG element.
     *
     * @param {SVGElement} svgElement
     * @param {boolean} isDark
     */
    showDiagram(svgElement, isDark) {
      state.hasValidDiagram = true;
      state.isDark = isDark;
      state.svgElement = svgElement;

      wrapper.classList.toggle('gm-dark', isDark);
      diagramTab.disabled = false;
      statusBadge.textContent = '';
      statusBadge.classList.add('gm-hidden');

      canvas.replaceChildren(svgElement);
      applyTransform();

      if (!state.userPinnedTab) {
        setMode('diagram', false);
      } else {
        setMode(state.mode, false);
      }
    },

    /**
     * Keeps Code view visible when syntax is incomplete (streaming) or invalid.
     *
     * @param {string} message
     * @param {boolean} isDark
     */
    showPendingOrError(message, isDark) {
      state.hasValidDiagram = false;
      state.isDark = isDark;
      state.svgElement = null;

      wrapper.classList.toggle('gm-dark', isDark);
      diagramTab.disabled = true;
      statusBadge.textContent = message;
      statusBadge.classList.remove('gm-hidden');

      canvas.replaceChildren();
      setMode('code', false);
    },

    /**
     * Cleans up injected DOM and restores original code visibility.
     */
    destroy() {
      if (state.codeTarget) {
        state.codeTarget.classList.remove('gm-code-hidden');
      }
      wrapper.remove();
      controllers.delete(container);
    }
  };

  controllers.set(container, controller);
  return controller;
}

/**
 * Returns an existing controller for a container, if mounted.
 *
 * @param {Element} container
 */
export function getCardController(container) {
  return controllers.get(container) || null;
}
