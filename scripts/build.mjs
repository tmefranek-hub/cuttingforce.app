// Build: lesbare Quellen in src/ → minifizierte Auslieferung in public/
// Aufruf: node scripts/build.mjs   (esbuild muss verfügbar sein: npm i -D esbuild)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = require('esbuild'); } catch { esbuild = require('/opt/npm-tools/node_modules/esbuild'); }

const min = (code, loader) => esbuild.transformSync(code, { loader, minify: true, charset: 'utf8', legalComments: 'none' }).code.trim();

// Seiten: Inline-<script> (ohne src, kein JSON) und <style> minifizieren
for (const page of ['schnittkraftrechner', 'spanbildung', 'vorspannrechner', 'gewinde']) {
  let html = readFileSync(`src/${page}/index.html`, 'utf8');
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (m, js) => `<script>${min(js, 'js')}</script>`);
  html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => `<style>${min(css, 'css')}</style>`);
  mkdirSync(`public/${page}`, { recursive: true });
  writeFileSync(`public/${page}/index.html`, html);
  console.log(`public/${page}/index.html`, html.length);
}
// Mitglieder-Module
mkdirSync('public/app/m', { recursive: true });
for (const f of readdirSync('src/member').filter((x) => x.endsWith('.js'))) {
  const out = min(readFileSync(`src/member/${f}`, 'utf8'), 'js');
  writeFileSync(`public/app/m/${f}`, out + '\n');
  console.log(`public/app/m/${f}`, out.length);
}
