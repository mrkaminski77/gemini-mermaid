import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const isWatch = process.argv.includes('--watch');
const distDir = resolve('dist');

function copyStaticAssets() {
  mkdirSync(distDir, { recursive: true });
  cpSync('manifest.json', resolve(distDir, 'manifest.json'));
  cpSync('src/styles.css', resolve(distDir, 'styles.css'));
  cpSync('icons', resolve(distDir, 'icons'), { recursive: true });
}

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
