import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const isWatch = process.argv.includes('--watch');
const distDir = resolve('dist');

function copyStaticAssets() {
  mkdirSync(distDir, { recursive: true });
  cpSync('manifest.json', resolve(distDir, 'manifest.json'));
  cpSync('src/styles.css', resolve(distDir, 'styles.css'));
  cpSync('icons', resolve(distDir, 'icons'), { recursive: true });
}

/**
 * Rewrites raw innerHTML string assignments inside bundled Mermaid / d3 dependencies
 * so they comply with host pages enforcing Trusted Types (e.g. gemini.google.com).
 */
const trustedTypesSafeDepsPlugin = {
  name: 'trusted-types-safe-deps',
  setup(build) {
    build.onLoad({ filter: /node_modules\/(mermaid|d3-selection|d3)\/.*\.(mjs|js)$/ }, (args) => {
      let contents = readFileSync(args.path, 'utf8');
      let modified = false;

      if (contents.includes('style1.innerHTML = rules;')) {
        contents = contents.replace('style1.innerHTML = rules;', 'style1.textContent = rules;');
        modified = true;
      }

      if (contents.includes('decoder.innerHTML = html;')) {
        contents = contents.replace(
          'decoder.innerHTML = html;',
          'decoder.innerHTML = globalThis.__gmTrustedHtml ? globalThis.__gmTrustedHtml(html) : html;'
        );
        modified = true;
      }

      if (contents.includes('divElem.innerHTML = await renderKatexSanitized(text, config2);')) {
        contents = contents.replace(
          'divElem.innerHTML = await renderKatexSanitized(text, config2);',
          'divElem.innerHTML = globalThis.__gmTrustedHtml ? globalThis.__gmTrustedHtml(await renderKatexSanitized(text, config2)) : await renderKatexSanitized(text, config2);'
        );
        modified = true;
      }

      if (contents.includes('this.innerHTML = "";')) {
        contents = contents
          .replace(
            'this.innerHTML = "";',
            'this.innerHTML = globalThis.__gmTrustedHtml ? globalThis.__gmTrustedHtml("") : "";'
          )
          .replace(
            'this.innerHTML = value;',
            'this.innerHTML = globalThis.__gmTrustedHtml ? globalThis.__gmTrustedHtml(value) : value;'
          )
          .replace(
            'this.innerHTML = v == null ? "" : v;',
            'this.innerHTML = globalThis.__gmTrustedHtml ? globalThis.__gmTrustedHtml(v == null ? "" : v) : (v == null ? "" : v);'
          );
        modified = true;
      }

      if (!modified) {
        return null;
      }

      return { contents, loader: 'js' };
    });
  }
};

async function run() {
  if (!isWatch) {
    rmSync(distDir, { recursive: true, force: true });
  }
  copyStaticAssets();

  const buildOptions = {
    entryPoints: ['src/content.js'],
    bundle: true,
    outfile: 'dist/content.js',
    format: 'iife',
    platform: 'browser',
    target: ['firefox115'],
    charset: 'utf8',
    sourcemap: isWatch ? 'inline' : false,
    minify: !isWatch,
    plugins: [trustedTypesSafeDepsPlugin],
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching src/ for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Built extension into dist/');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
