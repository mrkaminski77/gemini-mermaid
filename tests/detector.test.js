import { describe, expect, it } from 'vitest';
import {
  detectMermaidBlock,
  findCodeBlockContainers,
  hasMermaidKeyword,
  stripLeadingMetadata
} from '../src/detector.js';

describe('stripLeadingMetadata & hasMermaidKeyword', () => {
  it('detects standard flowchart and graph keywords', () => {
    expect(hasMermaidKeyword('flowchart TD\n  A --> B')).toBe(true);
    expect(hasMermaidKeyword('graph LR\n  A --> B')).toBe(true);
    expect(hasMermaidKeyword('flowchart\n  A --> B')).toBe(true);
  });

  it('detects other mermaid diagram keywords', () => {
    expect(hasMermaidKeyword('sequenceDiagram\n  Alice->>Bob: Hi')).toBe(true);
    expect(hasMermaidKeyword('erDiagram\n  USER ||--o{ ORDER : places')).toBe(true);
    expect(hasMermaidKeyword('stateDiagram-v2\n  [*] --> Idle')).toBe(true);
    expect(hasMermaidKeyword('gantt\n  title Roadmap')).toBe(true);
    expect(hasMermaidKeyword('pie showData\n  "A" : 50')).toBe(true);
    expect(hasMermaidKeyword('C4Context\n  System(s, "App")')).toBe(true);
  });

  it('strips YAML frontmatter and %% comments before checking keywords', () => {
    const withMeta = [
      '---',
      'title: Auth Flow',
      '---',
      '%% leading comment',
      '%%{init: {"theme": "dark"}}%%',
      'sequenceDiagram',
      '  Client->>API: POST /login'
    ].join('\n');

    expect(stripLeadingMetadata(withMeta).startsWith('sequenceDiagram')).toBe(true);
    expect(hasMermaidKeyword(withMeta)).toBe(true);
  });

  it('rejects non-mermaid snippets', () => {
    expect(hasMermaidKeyword('const graph = new Map();')).toBe(false);
    expect(hasMermaidKeyword('def pie_chart():\n  pass')).toBe(false);
    expect(hasMermaidKeyword('graph of monthly revenue')).toBe(false);
    expect(hasMermaidKeyword('')).toBe(false);
  });
});

describe('detectMermaidBlock & findCodeBlockContainers', () => {
  it('detects Gemini <code-block> with explicit Mermaid header decoration', () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block">
          <div class="code-block-decoration"><span>Mermaid</span></div>
          <div class="formatted-code-block-internal-container">
            <pre><code>flowchart TD\n  Start --> End</code></pre>
          </div>
        </div>
      </code-block>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(1);
    expect(containers[0].tagName).toBe('CODE-BLOCK');

    const result = detectMermaidBlock(containers[0]);
    expect(result.isMermaid).toBe(true);
    expect(result.explicit).toBe(true);
    expect(result.source).toContain('flowchart TD');
  });

  it('detects <pre><code class="language-mermaid">', () => {
    document.body.innerHTML = `
      <pre><code class="language-mermaid">sequenceDiagram\n  A->>B: Hello</code></pre>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(1);

    const result = detectMermaidBlock(containers[0]);
    expect(result.isMermaid).toBe(true);
    expect(result.explicit).toBe(true);
  });

  it('auto-detects unlabeled code blocks starting with Mermaid keywords', () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block-decoration"><span>Code</span></div>
        <pre><code>erDiagram\n  CUSTOMER ||--o{ ORDER : places</code></pre>
      </code-block>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(1);

    const result = detectMermaidBlock(containers[0]);
    expect(result.isMermaid).toBe(true);
    expect(result.explicit).toBe(false);
  });

  it('ignores non-Mermaid languages like python and regular markdown', () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block-decoration"><span>Python</span></div>
        <pre><code class="language-python">print("flowchart TD")</code></pre>
      </code-block>
      <pre><code class="language-markdown"># Heading\n\nSome markdown text.</code></pre>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(2);
    expect(detectMermaidBlock(containers[0]).isMermaid).toBe(false);
    expect(detectMermaidBlock(containers[1]).isMermaid).toBe(false);
  });

  it('detects Gemini Code snippet labeled language-markdown when starting with flowchart TD', () => {
    document.body.innerHTML = `
      <code-block>
        <div class="code-block">
          <div class="code-block-decoration"><span>Code snippet</span></div>
          <div class="formatted-code-block-internal-container">
            <pre><code class="language-markdown">flowchart TD\n  A[Start] --> B[End]</code></pre>
          </div>
        </div>
      </code-block>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(1);
    const result = detectMermaidBlock(containers[0]);
    expect(result.isMermaid).toBe(true);
    expect(result.source).toBe('flowchart TD\n  A[Start] --> B[End]');
  });

  it('preserves line breaks when code lines are wrapped in div or br elements', () => {
    document.body.innerHTML = `
      <div class="code-block-container">
        <div class="code-block-header"><span>Code snippet</span></div>
        <pre><code><div>flowchart TD</div><div>  A --> B</div></code></pre>
      </div>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(1);
    const result = detectMermaidBlock(containers[0]);
    expect(result.isMermaid).toBe(true);
    expect(result.source).toBe('flowchart TD\n  A --> B');
  });

  it('detects standalone Gemini <code data-test-id="code-content" class="code-container formatted"> without <pre>', () => {
    document.body.innerHTML = `
      <div class="snippet-wrapper">
        <code _ngcontent-ng-c3956100380="" role="text" data-test-id="code-content" class="code-container formatted ng-tns-c3956100380-15">flowchart TD
    Root[Human Skeletal Joints] --&gt; Structural[Structural Classification&lt;br/&gt;By Tissue Type]</code>
      </div>
    `;

    const containers = findCodeBlockContainers(document);
    expect(containers).toHaveLength(1);
    expect(containers[0].tagName).toBe('CODE');

    const result = detectMermaidBlock(containers[0]);
    expect(result.isMermaid).toBe(true);
    expect(result.source).toContain('flowchart TD');
    expect(result.source).toContain('Root[Human Skeletal Joints] --> Structural[Structural Classification<br/>By Tissue Type]');
  });
});
