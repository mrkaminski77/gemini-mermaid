# Walkthrough: Gemini Mermaid Renderer (Firefox Extension)

## Summary of Changes

Implemented a Manifest V3 Firefox extension that detects Mermaid code blocks in the Google Gemini web app (`https://gemini.google.com/*`) and renders them into interactive diagram cards.

### Implemented Files
- **Extension Manifest & Build**
  - [manifest.json](../manifest.json): Manifest V3 configuration targeting `https://gemini.google.com/*`, requesting `clipboardWrite` permission, and configuring `browser_specific_settings.gecko` (min Firefox `115.0`, `data_collection_permissions.required: ["none"]`).
  - [package.json](../package.json) & [build.mjs](../build.mjs): Bundles `mermaid` (`^11.4.1`) and extension source into `dist/content.js` using `esbuild`, copying static assets (`manifest.json`, `styles.css`, `icons/`).
  - [icons/icon.svg](../icons/icon.svg): Vector extension icon.
- **Detection & Streaming Observer**
  - [src/detector.js](../src/detector.js): Identifies both explicitly labeled Mermaid blocks (`.language-mermaid`, `.code-block-decoration` headers) and unlabeled blocks starting with Mermaid syntax keywords (after stripping optional YAML frontmatter and `%%` comments), while ignoring other explicitly labeled languages (e.g., Python, Markdown). Normalizes nested `<code-block>` / `.code-block` / `<pre>` containers via `normalizeCodeBlockContainer`.
  - [src/observer.js](../src/observer.js): Runs a `MutationObserver` with per-block `300ms` debouncing for Gemini's streaming responses and watches `documentElement` / `body` theme attributes to re-render diagrams when toggling Light/Dark mode.
- **Renderer, UI Card & Exporter**
  - [src/renderer.js](../src/renderer.js): Validates syntax via `mermaid.parse(..., { suppressErrors: true })`, configures `mermaid` with `securityLevel: 'strict'`, and parses SVG output via `DOMParser` + `document.importNode` to avoid raw `innerHTML` injection.
  - [src/ui.js](../src/ui.js) & [src/styles.css](../src/styles.css): Mounts a themed toolbar and viewport supporting **Diagram | Code** tab toggling, click-and-drag panning, mouse-wheel zooming, `+`/`-`/`100%` reset buttons, and fallback to Code view with a status badge when syntax is incomplete or invalid.
  - [src/exporter.js](../src/exporter.js): Implements **Download SVG**, **Download PNG** (2x HiDPI with solid theme background), and **Copy PNG to clipboard**.
  - [src/content.js](../src/content.js): Content script entry point.
- **Tests & Local Harness**
  - [tests/detector.test.js](../tests/detector.test.js), [tests/renderer.test.js](../tests/renderer.test.js), [tests/ui.test.js](../tests/ui.test.js), [tests/exporter.test.js](../tests/exporter.test.js)
  - [test-harness.html](../test-harness.html): Local browser harness simulating Gemini `<code-block>` markup, theme toggling, and streamed diagram chunks.

---

## Verification & Validation Results

### 1. Unit & DOM Integration Tests (`npm test`)
Ran `vitest run` across all 4 test files (`jsdom` environment):
- **Result**: **4 test files passed, 15 tests passed**.
- Note: `tests/ui.test.js` mocks `renderFn` for async UI/streaming/theme state transitions (because `jsdom` lacks SVG layout `getBBox()`), while `tests/renderer.test.js` exercises the real `mermaid.parse()` engine alongside `parseSvgMarkup()` and `isDarkMode()`.

### 2. Build, Linting & Packaging (`npm run build && npm run lint && npm run package`)
- `npm run build`: Bundled `dist/content.js` (3.4 MB), `dist/styles.css`, `dist/manifest.json`, and `dist/icons/icon.svg`.
- `npm run lint` (`web-ext lint --source-dir dist`): Exited with code `0` — **0 errors, 0 notices**, 13 warnings originating inside the bundled `mermaid` library (`UNSAFE_VAR_ASSIGNMENT` / `DANGEROUS_EVAL` in upstream dependencies).
- `npm run package`: Produced `web-ext-artifacts/gemini_mermaid_renderer-1.0.0.zip` (954 KB).

---

## Manual Verification Instructions

1. **Load in Firefox**:
   - Navigate to `about:debugging#/runtime/this-firefox`.
   - Click **Load Temporary Add-on...** and select `dist/manifest.json` (or `web-ext-artifacts/gemini_mermaid_renderer-1.0.0.zip`).
2. **Test on Gemini**:
   - Open `https://gemini.google.com` and ask Gemini to generate a Mermaid diagram (e.g., a flowchart or sequence diagram).
   - Verify the diagram renders automatically once valid syntax finishes streaming, toggles between **Diagram** and **Code**, pans/zooms smoothly, updates on Light/Dark theme switch, and exports SVG/PNG + copies PNG to clipboard.
3. **Optional Local Preview**:
   - Open [test-harness.html](../test-harness.html) in a browser to test explicit blocks, unlabeled keyword blocks, non-Mermaid Python blocks, Dark/Light toggling, and simulated streaming locally.
