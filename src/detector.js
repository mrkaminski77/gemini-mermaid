/**
 * Detection utilities for identifying Mermaid code blocks inside the Gemini web app.
 */

const HEADER_SELECTORS = [
  '.code-block-decoration span',
  '.code-block-decoration',
  '.header-formatted',
  '[data-test-id="code-block-header"]',
  '.code-header span',
  '.code-header'
].join(', ');

const MERMAID_KEYWORDS = new RegExp(
  [
    /^(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/.source,
    /^flowchart\s*$/.source,
    /^(?:sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|gitGraph|mindmap|timeline|journey|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey-beta|xychart-beta|block-beta|packet-beta|architecture-beta|kanban|zenuml)\b/.source,
    /^pie(?:\s+showData\b|\s+title\b|\s*$)/.source
  ].join('|'),
  'm'
);

/**
 * Strips leading YAML frontmatter, Mermaid init directives, comments, and blank lines
 * so keyword auto-detection evaluates the first real diagram statement.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripLeadingMetadata(source) {
  let text = source.trimStart();

  // Strip YAML frontmatter block if present at top
  const frontmatterMatch = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    text = text.slice(frontmatterMatch[0].length);
  }

  // Strip leading blank lines, %% comments, and %%{init:...}%% directives
  const lines = text.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed === '' || trimmed.startsWith('%%')) {
      index += 1;
      continue;
    }
    break;
  }

  return lines.slice(index).join('\n').trimStart();
}

/**
 * Checks whether a code string begins with valid Mermaid diagram syntax.
 *
 * @param {string} source
 * @returns {boolean}
 */
export function hasMermaidKeyword(source) {
  if (!source || typeof source !== 'string') {
    return false;
  }
  const stripped = stripLeadingMetadata(source);
  if (!stripped) {
    return false;
  }
  const firstLine = stripped.split(/\r?\n/, 1)[0].trim();
  return MERMAID_KEYWORDS.test(firstLine);
}

/**
 * Checks if a code block container has an explicit Mermaid language label or class.
 *
 * @param {Element} container
 * @param {Element|null} codeEl
 * @returns {boolean}
 */
export function hasExplicitMermaidLabel(container, codeEl) {
  if (codeEl) {
    const className = codeEl.getAttribute('class') || '';
    if (/\blanguage-mermaid\b/i.test(className) || /\bmermaid\b/i.test(className)) {
      return true;
    }
    const dataLang =
      codeEl.getAttribute('data-lang') ||
      codeEl.getAttribute('data-language') ||
      '';
    if (dataLang.trim().toLowerCase() === 'mermaid') {
      return true;
    }
  }

  const preEl = container.matches('pre') ? container : container.querySelector('pre');
  if (preEl) {
    const preClass = preEl.getAttribute('class') || '';
    if (/\blanguage-mermaid\b/i.test(preClass)) {
      return true;
    }
  }

  const headerEls = container.querySelectorAll(HEADER_SELECTORS);
  for (const el of headerEls) {
    if (el.closest('.gm-mermaid-wrapper')) {
      continue;
    }
    const text = (el.textContent || '').trim().toLowerCase();
    if (text === 'mermaid') {
      return true;
    }
  }

  return false;
}

/**
 * Finds the inner <code> (or fallback <pre>) element for a code block container.
 *
 * @param {Element} container
 * @returns {Element|null}
 */
export function getCodeElement(container) {
  if (!container) return null;
  if (container.matches('code')) return container;

  const codeEls = container.querySelectorAll('pre code, code');
  for (const el of codeEls) {
    if (!el.closest('.gm-mermaid-wrapper')) {
      return el;
    }
  }

  if (container.matches('pre')) {
    return container;
  }

  const pre = container.querySelector('pre');
  return pre && !pre.closest('.gm-mermaid-wrapper') ? pre : null;
}

/**
 * Extracts raw diagram source text from a code block container.
 *
 * @param {Element} container
 * @returns {string}
 */
export function extractCodeText(container) {
  const codeEl = getCodeElement(container);
  if (!codeEl) return '';
  return (codeEl.textContent || '').replace(/\u00a0/g, ' ').trim();
}

/**
 * Analyzes a code block container to determine if it is a Mermaid diagram block.
 *
 * @param {Element} container
 * @returns {{ isMermaid: boolean, explicit: boolean, source: string }}
 */
export function detectMermaidBlock(container) {
  const codeEl = getCodeElement(container);
  if (!codeEl) {
    return { isMermaid: false, explicit: false, source: '' };
  }

  const source = extractCodeText(container);
  if (!source) {
    return { isMermaid: false, explicit: false, source: '' };
  }

  const explicit = hasExplicitMermaidLabel(container, codeEl);
  if (explicit) {
    return { isMermaid: true, explicit: true, source };
  }

  // Only auto-detect unlabeled blocks or generic/plaintext blocks; do not hijack
  // blocks explicitly labeled as another language (e.g. python, markdown, html).
  const className = codeEl.getAttribute('class') || '';
  const langMatch = className.match(/\blanguage-([a-z0-9_-]+)/i);
  if (langMatch) {
    const lang = langMatch[1].toLowerCase();
    if (lang !== 'mermaid' && lang !== 'plaintext' && lang !== 'text' && lang !== 'none') {
      return { isMermaid: false, explicit: false, source };
    }
  }

  const isKeyword = hasMermaidKeyword(source);
  return { isMermaid: isKeyword, explicit: false, source };
}

/**
 * Normalizes a matched element to its outermost logical code block container
 * (e.g. preferring `<code-block>` over a nested `.code-block` or `<pre>`).
 *
 * @param {Element|null} el
 * @returns {Element|null}
 */
export function normalizeCodeBlockContainer(el) {
  if (!el || el.closest('.gm-mermaid-wrapper')) {
    return null;
  }

  let current = el.closest('code-block, .code-block, pre');
  if (!current || current.closest('.gm-mermaid-wrapper')) {
    return null;
  }

  while (current.parentElement) {
    const outer = current.parentElement.closest('code-block, .code-block');
    if (!outer || outer.closest('.gm-mermaid-wrapper')) {
      break;
    }
    current = outer;
  }

  return current;
}

/**
 * Locates distinct logical code block containers within a root element,
 * deduplicating nested `.code-block` and `<pre>` elements inside `<code-block>` wrappers.
 *
 * @param {ParentNode} root
 * @returns {Element[]}
 */
export function findCodeBlockContainers(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return [];
  }

  const candidates = root.querySelectorAll('code-block, .code-block, pre');
  const seen = new Set();
  const containers = [];

  for (const el of candidates) {
    const normalized = normalizeCodeBlockContainer(el);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    if (getCodeElement(normalized)) {
      seen.add(normalized);
      containers.push(normalized);
    }
  }

  return containers;
}
