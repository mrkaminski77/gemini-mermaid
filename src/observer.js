import {
  detectMermaidBlock,
  findCodeBlockContainers,
  normalizeCodeBlockContainer
} from './detector.js';
import { isDarkMode, renderMermaidSource } from './renderer.js';
import { getCardController, getOrCreateCardController } from './ui.js';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Creates a coordinator that observes Gemini's DOM for Mermaid blocks,
 * debounces streaming updates, and reacts to theme changes.
 *
 * @param {{
 *   root?: Element,
 *   doc?: Document,
 *   debounceMs?: number,
 *   renderFn?: typeof renderMermaidSource
 * }} [options]
 */
export function createMermaidObserver(options = {}) {
  const doc = options.doc || document;
  const root = options.root || doc.body;
  const debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : DEFAULT_DEBOUNCE_MS;
  const renderFn = options.renderFn || renderMermaidSource;

  const pendingTimers = new WeakMap();
  const lastSignatures = new WeakMap();
  const activeContainers = new Set();

  let currentDark = isDarkMode(doc);
  let domObserver = null;
  let themeObserver = null;

  /**
   * Processes a single code block container immediately.
   *
   * @param {Element} container
   * @param {boolean} [force]
   */
  async function processContainer(container, force = false) {
    if (!container || !container.isConnected) {
      activeContainers.delete(container);
      return;
    }

    const detection = detectMermaidBlock(container);
    if (!detection.isMermaid) {
      const existing = getCardController(container);
      if (existing) {
        existing.destroy();
        lastSignatures.delete(container);
        activeContainers.delete(container);
      }
      return;
    }

    const dark = isDarkMode(doc);
    const signature = `${dark ? 'dark' : 'light'}::${detection.explicit ? '1' : '0'}::${detection.source}`;

    if (!force && lastSignatures.get(container) === signature) {
      return;
    }
    lastSignatures.set(container, signature);
    activeContainers.add(container);

    const result = await renderFn(detection.source, { dark, doc });

    // Re-check connection and whether source changed while awaiting async render
    if (!container.isConnected) {
      activeContainers.delete(container);
      return;
    }
    if (lastSignatures.get(container) !== signature) {
      return;
    }

    if (result.valid && result.svgElement) {
      const controller = getOrCreateCardController(container);
      controller.showDiagram(result.svgElement, dark);
    } else if (detection.explicit) {
      // Explicit mermaid blocks stay in Code view with a subtle status indicator while streaming or invalid
      const controller = getOrCreateCardController(container);
      controller.showPendingOrError('Mermaid syntax pending/invalid', dark);
    } else {
      // Auto-detected unlabeled blocks should only take over once valid Mermaid syntax is parsed
      const existing = getCardController(container);
      if (existing) {
        existing.showPendingOrError('Mermaid syntax pending/invalid', dark);
      }
    }
  }

  /**
   * Schedules debounced processing for a code block container.
   *
   * @param {Element} container
   */
  function scheduleContainer(container) {
    const existingTimer = pendingTimers.get(container);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      pendingTimers.delete(container);
      processContainer(container);
    }, debounceMs);

    pendingTimers.set(container, timer);
  }

  /**
   * Scans a subtree for code blocks and processes/schedules them.
   *
   * @param {ParentNode} targetRoot
   * @param {boolean} [immediate]
   */
  function scan(targetRoot = root, immediate = false) {
    const containers = findCodeBlockContainers(targetRoot);
    for (const container of containers) {
      if (immediate) {
        processContainer(container);
      } else {
        scheduleContainer(container);
      }
    }
  }

  /**
   * Checks if the active theme changed and re-renders active diagrams if needed.
   */
  function handleThemeChange() {
    const nextDark = isDarkMode(doc);
    if (nextDark === currentDark) return;
    currentDark = nextDark;

    for (const container of activeContainers) {
      if (container.isConnected) {
        processContainer(container, true);
      } else {
        activeContainers.delete(container);
      }
    }
  }

  function start() {
    if (!root) return;

    // Initial pass for already-rendered blocks
    scan(root, true);

    domObserver = new MutationObserver((mutations) => {
      const touched = new Set();

      for (const mutation of mutations) {
        const targetEl =
          mutation.target.nodeType === 1
            ? mutation.target
            : mutation.target.parentElement;

        if (!targetEl || targetEl.closest('.gm-mermaid-wrapper')) {
          continue;
        }

        const enclosing = normalizeCodeBlockContainer(targetEl);
        if (enclosing) {
          touched.add(enclosing);
        }

        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (node.closest('.gm-mermaid-wrapper') || node.classList?.contains('gm-mermaid-wrapper')) {
              continue;
            }
            const normalizedSelf = normalizeCodeBlockContainer(node);
            if (normalizedSelf) {
              touched.add(normalizedSelf);
            }
            const nested = findCodeBlockContainers(node);
            for (const c of nested) {
              touched.add(c);
            }
          }
        }
      }

      for (const container of touched) {
        scheduleContainer(container);
      }
    });

    domObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });

    themeObserver = new MutationObserver(() => {
      handleThemeChange();
    });

    if (doc.documentElement) {
      themeObserver.observe(doc.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'style']
      });
    }
    if (doc.body) {
      themeObserver.observe(doc.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'style']
      });
    }
  }

  function stop() {
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    if (themeObserver) {
      themeObserver.disconnect();
      themeObserver = null;
    }
  }

  return {
    start,
    stop,
    scan,
    processContainer,
    handleThemeChange
  };
}
