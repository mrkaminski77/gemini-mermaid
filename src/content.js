import { createMermaidObserver } from './observer.js';

function bootstrap() {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }

  const observer = createMermaidObserver({
    doc: document,
    root: document.body
  });
  observer.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
