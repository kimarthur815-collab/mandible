// Bundles each page into one self-contained HTML file in docs/ (served by GitHub Pages).
//   node build.mjs          build every page
//   node build.mjs map      build one page
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const PAGES = {
  map:       ['src/map/main_map.js',    'templates/map.html',       'docs/index.html'],
  roach:     ['src/main.js',            'templates/roach.html',     'docs/roach.html'],
  centipede: ['src/main_centipede.js',  'templates/centipede.html', 'docs/centipede.html'],
  spider:    ['src/main_spider.js',     'templates/spider.html',    'docs/spider.html'],
};

async function page(name) {
  const [entry, template, out] = PAGES[name];
  const res = await build({
    entryPoints: [entry], bundle: true, format: 'iife', minify: true,
    write: false, target: ['es2020'], legalComments: 'none',
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = readFileSync(template, 'utf8');
  const marker = '/*__APP__*/';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error(`${template}: missing ${marker}`);
  mkdirSync(dirname(out), { recursive: true });
  const doc = html.slice(0, i) + js + html.slice(i + marker.length);
  writeFileSync(out, doc);
  console.log(`${name.padEnd(10)} → ${out}  ${(doc.length / 1024).toFixed(0)} KB`);
}

const names = process.argv.slice(2);
for (const n of names.length ? names : Object.keys(PAGES)) {
  if (!PAGES[n]) { console.error(`unknown page: ${n} (${Object.keys(PAGES).join(', ')})`); process.exit(1); }
  await page(n);
}
