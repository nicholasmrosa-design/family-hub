// Builds the app into ./docs (GitHub Pages serves this folder) and the worker into ./worker/worker.js
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const out = 'docs';
rmSync(`${out}/chunks`, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await esbuild.build({
  entryPoints: { app: 'src/main.jsx' },
  bundle: true, minify: true, format: 'esm', target: ['safari15'], splitting: true,
  jsx: 'automatic', jsxImportSource: 'preact',
  outdir: out, chunkNames: 'chunks/[name]-[hash]',
  legalComments: 'none',
});
await esbuild.build({ entryPoints: ['src/styles.css'], bundle: true, minify: true, outfile: `${out}/app.css`, target: ['safari15'] });

for (const f of ['index.html', 'manifest.webmanifest']) cpSync(`public/${f}`, `${out}/${f}`);
cpSync('public/icons', `${out}/icons`, { recursive: true });
// Never overwrite config.js once it has been filled in.
if (!existsSync(`${out}/config.js`)) cpSync('public/config.js', `${out}/config.js`);
writeFileSync(`${out}/sw.js`, readFileSync('public/sw.js', 'utf8').replace('__BUILD__', Date.now().toString(36)));
writeFileSync(`${out}/.nojekyll`, '');

await esbuild.build({
  entryPoints: ['worker/src/index.js'], bundle: true, format: 'esm', target: 'es2022',
  outfile: 'worker/worker.js', legalComments: 'none',
  banner: { js: '// Family Hub worker: Apple Calendar feed + reminder notifications. Paste this whole file into your Cloudflare worker.' },
});
console.log('Built docs/ and worker/worker.js');
