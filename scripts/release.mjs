import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_SLUG = 'mrkaminski77/gemini-mermaid';
const rootDir = resolve('.');
const artifactsDir = resolve(rootDir, 'web-ext-artifacts');
const updatesPath = resolve(rootDir, 'updates.json');
const manifestPath = resolve(rootDir, 'manifest.json');
const pkgPath = resolve(rootDir, 'package.json');

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const shouldPublish = args.has('--publish');
const signOnly = args.has('--sign-only');
const bumpArg = rawArgs.find((a) => a.startsWith('--bump='))?.split('=')[1] || '';

function run(cmd, cmdArgs, options = {}) {
  console.log(`> ${cmd} ${cmdArgs.join(' ')}`);
  execFileSync(cmd, cmdArgs, {
    stdio: 'inherit',
    cwd: rootDir,
    ...options
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function gitTagExists(tag) {
  try {
    const out = execFileSync('git', ['tag', '-l', tag], {
      cwd: rootDir,
      encoding: 'utf8'
    }).trim();
    return out === tag;
  } catch {
    return false;
  }
}

function incrementSemver(version, level) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Unsupported semver format in manifest.json: ${version}`);
  }
  let [major, minor, patch] = parts;
  if (level === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function maybeBumpVersion(manifest) {
  if (!bumpArg || bumpArg === 'none') {
    return manifest.version;
  }

  let level = bumpArg;
  if (level === 'auto') {
    if (!gitTagExists(`v${manifest.version}`)) {
      return manifest.version;
    }
    level = 'patch';
  }

  const nextVersion = incrementSemver(manifest.version, level);
  console.log(`Bumping version: ${manifest.version} -> ${nextVersion}`);

  manifest.version = nextVersion;
  writeJson(manifestPath, manifest);

  const pkg = readJson(pkgPath);
  pkg.version = nextVersion;
  writeJson(pkgPath, pkg);

  const lockPath = resolve(rootDir, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = nextVersion;
    if (lock.packages?.['']) {
      lock.packages[''].version = nextVersion;
    }
    writeJson(lockPath, lock);
  }

  return nextVersion;
}

function buildSourceArchive(version) {
  mkdirSync(artifactsDir, { recursive: true });
  const sourceZipPath = join(artifactsDir, `gemini-mermaid-source-v${version}.zip`);
  rmSync(sourceZipPath, { force: true });

  const entries = [
    'package.json',
    'package-lock.json',
    'build.mjs',
    'manifest.json',
    'vitest.config.js',
    'README.md',
    'src',
    'icons',
    'tests'
  ].filter((entry) => existsSync(resolve(rootDir, entry)));

  run('zip', ['-r', '-q', sourceZipPath, ...entries]);
  return sourceZipPath;
}

function findSignedXpi(version) {
  const files = readdirSync(artifactsDir)
    .filter((f) => f.endsWith('.xpi'))
    .map((f) => ({
      name: f,
      path: join(artifactsDir, f),
      mtimeMs: statSync(join(artifactsDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const exactMatch = files.find((f) => f.name.includes(version));
  if (exactMatch) return exactMatch;
  if (files.length > 0) return files[0];

  throw new Error(`No signed .xpi file found in ${artifactsDir}`);
}

function computeSha256(filePath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
}

function updateManifestJsonFile(addonId, version, minVersion, xpiFilename, sha256) {
  let existing = { addons: {} };
  if (existsSync(updatesPath)) {
    try {
      existing = readJson(updatesPath);
    } catch {
      existing = { addons: {} };
    }
  }

  if (!existing.addons) {
    existing.addons = {};
  }
  if (!existing.addons[addonId]) {
    existing.addons[addonId] = { updates: [] };
  }

  const prevUpdates = Array.isArray(existing.addons[addonId].updates)
    ? existing.addons[addonId].updates.filter((u) => u.version !== version)
    : [];

  const nextEntry = {
    version,
    update_link: `https://github.com/${REPO_SLUG}/releases/download/v${version}/${xpiFilename}`,
    update_hash: `sha256:${sha256}`,
    applications: {
      gecko: {
        strict_min_version: minVersion
      }
    }
  };

  existing.addons[addonId].updates = [...prevUpdates, nextEntry];
  writeJson(updatesPath, existing);
  console.log(`Updated ${updatesPath} for ${addonId} v${version}`);
}

function main() {
  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;

  if (!issuer || !secret) {
    console.error('Error: AMO_JWT_ISSUER and AMO_JWT_SECRET environment variables must be set.');
    process.exit(1);
  }

  const manifest = readJson(manifestPath);
  const version = maybeBumpVersion(manifest);
  const gecko = manifest.browser_specific_settings?.gecko || {};
  const addonId = gecko.id;
  const minVersion = gecko.strict_min_version || '115.0';

  if (!version || !addonId) {
    console.error('Error: manifest.json must define version and browser_specific_settings.gecko.id');
    process.exit(1);
  }

  const sourceZipPath = join(artifactsDir, `gemini-mermaid-source-v${version}.zip`);

  if (!signOnly) {
    // 1. Verify tests, bundle dist/, and lint self-hosted manifest
    run('npm', ['test']);
    run('npm', ['run', 'build']);
    run('npm', ['run', 'lint']);

    // 2. Package readable source archive for AMO verification
    buildSourceArchive(version);
  } else if (!existsSync(sourceZipPath)) {
    buildSourceArchive(version);
  }

  // 3. Sign via Mozilla AMO (unlisted channel for self-hosted GitHub releases)
  // Pass credentials via WEB_EXT_API_KEY / WEB_EXT_API_SECRET env vars so secrets never appear in logs or argv.
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  run(
    npxCmd,
    [
      'web-ext',
      'sign',
      '--channel=unlisted',
      '--source-dir=dist',
      `--artifacts-dir=${artifactsDir}`,
      `--upload-source-code=${sourceZipPath}`
    ],
    {
      env: {
        ...process.env,
        WEB_EXT_API_KEY: issuer,
        WEB_EXT_API_SECRET: secret
      }
    }
  );

  // 4. Locate signed XPI and update updates.json with SHA-256 and GitHub release URL
  const xpi = findSignedXpi(version);
  const sha256 = computeSha256(xpi.path);
  updateManifestJsonFile(addonId, version, minVersion, xpi.name, sha256);

  console.log(`\nRelease artifacts ready:`);
  console.log(`  Version: ${version}`);
  console.log(`  Signed XPI: ${xpi.path}`);
  console.log(`  Source ZIP: ${sourceZipPath}`);
  console.log(`  Updates JSON: ${updatesPath}`);

  if (shouldPublish) {
    const tag = `v${version}`;
    run('gh', [
      'release',
      'create',
      tag,
      xpi.path,
      updatesPath,
      '--repo',
      REPO_SLUG,
      '--title',
      `Gemini Mermaid Renderer ${tag}`,
      '--notes',
      `Signed Firefox extension release ${tag}.\n\n- Signed XPI: \`${xpi.name}\`\n- SHA-256: \`${sha256}\``
    ]);
  }
}

main();
