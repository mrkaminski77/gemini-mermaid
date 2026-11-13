# Gemini Mermaid Renderer

A Manifest V3 Firefox extension that automatically detects Mermaid diagram blocks in the Google Gemini web app (`https://gemini.google.com/*`) and renders them in-place as interactive diagrams.

## Features

- **Diagram / Code Toggle**: Renders Mermaid diagrams by default while preserving Gemini's original code block so you can switch back to raw code at any time.
- **Smart Block Detection**: Detects both explicitly labeled `mermaid` code blocks and unlabeled code blocks starting with Mermaid diagram keywords (`flowchart`, `graph`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `erDiagram`, `gantt`, `pie`, `gitGraph`, `mindmap`, `timeline`, `C4Context`, etc.), while ignoring other labeled languages.
- **Streaming Resilience**: Debounces DOM mutations (`300ms`) and validates syntax with `mermaid.parse()` before switching from Code view to Diagram view.
- **Pan & Zoom**: Supports click-and-drag panning, mouse-wheel zooming, and `+` / `−` / `100%` reset controls.
- **Export Options**: Download rendered diagrams as `.svg` or 2x HiDPI `.png`, or copy the `.png` directly to the clipboard (`clipboardWrite` permission).
- **Theme Sync**: Automatically matches Gemini's Light/Dark theme and re-renders active diagrams when the theme changes.

## Prerequisites

- **Node.js** (tested on v22.x) and **npm**
- **Firefox** 115.0 or newer

## Installation & Build

```bash
npm install
npm run build
```

This bundles the content script and assets into `dist/`.

### Available Scripts

- `npm run build` — Bundle extension into `dist/`
- `npm run watch` — Watch `src/` and rebuild automatically on changes
- `npm test` — Run unit and DOM integration tests with Vitest
- `npm run lint` — Validate `dist/` with `web-ext lint`
- `npm run package` — Build a distributable `.zip` archive in `web-ext-artifacts/`

## Loading in Firefox

1. Run `npm run build` (and optionally `npm run package`).
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on...**.
4. Select `dist/manifest.json` (or the packaged `.zip` in `web-ext-artifacts/`).
5. Visit `https://gemini.google.com` and ask Gemini to generate a Mermaid diagram.

You can also open [test-harness.html](test-harness.html) in a browser after running `npm run build` to preview explicit blocks, unlabeled keyword blocks, theme switching, and simulated streaming locally.

## Project Structure

- [manifest.json](manifest.json) — Firefox Manifest V3 configuration
- [build.mjs](build.mjs) — `esbuild` bundler and static asset copier
- [src/content.js](src/content.js) — Content script entry point
- [src/detector.js](src/detector.js) — Mermaid block & keyword detection
- [src/observer.js](src/observer.js) — Debounced `MutationObserver` & theme watcher
- [src/renderer.js](src/renderer.js) — `mermaid.parse()` / `mermaid.render()` & `DOMParser` SVG import
- [src/ui.js](src/ui.js) — Interactive toolbar, Diagram/Code toggle, and pan/zoom engine
- [src/exporter.js](src/exporter.js) — SVG download, 2x PNG export, and clipboard copy
- [src/styles.css](src/styles.css) — Light/Dark theme-aware UI styles
- [tests/](tests/) — Vitest + jsdom test suite
- [docs/implementation_plan.md](docs/implementation_plan.md) — Architecture & design plan
- [docs/walkthrough.md](docs/walkthrough.md) — Implementation & verification walkthrough
