// Package the webOS app into an .ipk via ares-package.
//
// Stages the webOS shell (appinfo.json, index.html, icons) together with the
// built chrome53 bundle (dist/webos/app.js) and the locally-bundled Shaka
// Player (shaka-player.compiled.js) into dist/package/, then runs ares-package.
//
// Prereqs: `npm run build` (produces dist/webos/app.js) and `npm run icons`
// (produces webos/icon.png + largeIcon.png). `npm run package` runs build first.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webosDir = path.join(root, 'webos');
const distWebos = path.join(root, 'dist', 'webos');
const stage = path.join(root, 'dist', 'package');
const outDir = path.join(root, 'dist');

function must(p, hint) {
  if (!fs.existsSync(p)) {
    console.error(`error: missing ${path.relative(root, p)} — ${hint}`);
    process.exit(1);
  }
}

const shakaSrc = path.join(root, 'node_modules', 'shaka-player', 'dist', 'shaka-player.compiled.js');

must(path.join(distWebos, 'app.js'), 'run `npm run build` first');
must(path.join(webosDir, 'icon.png'), 'run `npm run icons` first');
must(path.join(webosDir, 'largeIcon.png'), 'run `npm run icons` first');
must(shakaSrc, 'shaka-player not installed — run `npm install`');

// Fresh staging dir so a stale file can never leak into the package.
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

const files = [
  [path.join(webosDir, 'appinfo.json'), 'appinfo.json'],
  [path.join(webosDir, 'index.html'), 'index.html'],
  [path.join(webosDir, 'icon.png'), 'icon.png'],
  [path.join(webosDir, 'largeIcon.png'), 'largeIcon.png'],
  [path.join(distWebos, 'app.js'), 'app.js'],
  [shakaSrc, 'shaka-player.compiled.js'],
];
for (const [src, name] of files) {
  fs.copyFileSync(src, path.join(stage, name));
  console.log(`staged ${name}`);
}

const aresLocal = path.join(root, 'node_modules', '.bin', 'ares-package');
const aresBin = fs.existsSync(aresLocal) ? aresLocal : 'ares-package';
console.log(`packaging ${path.relative(root, stage)} with ares-package -> ${path.relative(root, outDir)}/ ...`);
execFileSync(aresBin, [stage, '-o', outDir], { stdio: 'inherit' });

const ipk = fs.readdirSync(outDir).filter((f) => f.endsWith('.ipk')).sort();
console.log(ipk.length ? `\nDone -> dist/${ipk[ipk.length - 1]}` : '\nWarning: ares-package reported success but no .ipk found in dist/');
