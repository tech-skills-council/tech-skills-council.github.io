/* Inlines CSS and JS into a single self-contained file, for previewing
   the site somewhere that only accepts one HTML document.
   Usage: node tools/build-preview.mjs index.html preview.html          */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [, , inFile = 'index.html', outFile = 'preview.html'] = process.argv;
const base = dirname(resolve(inFile));
let html = readFileSync(inFile, 'utf8');

html = html.replace(/<link rel="stylesheet" href="(assets\/[^"]+)">/g, (_m, href) =>
  `<style>\n${readFileSync(resolve(base, href), 'utf8')}\n</style>`
);

html = html.replace(/<script src="((?:assets\/|config\.js)[^"]*)"><\/script>/g, (_m, src) =>
  `<script>\n${readFileSync(resolve(base, src), 'utf8')}\n</script>`
);

writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${(html.length / 1024).toFixed(1)} KB)`);
