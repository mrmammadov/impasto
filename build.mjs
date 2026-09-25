// Bundles the app into one self-contained HTML file, dist/index.html (JS, CSS, fonts, icon and
// the sample picture inlined), plus the social preview image. dist/ is what gets deployed, and
// index.html also opens with a double-click.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';

const js = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: process.argv.includes('--minify'),
  write: false,
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

/** @param {string} path @param {string} type */
const dataUri = async (path, type) => `data:${type};base64,${(await readFile(path)).toString('base64')}`;

// fonts referenced from styles.css become data URIs, so the single file has no outside requests
let css = await readFile('styles.css', 'utf8');
for (const [ref, path] of css.matchAll(/url\(["']?(assets\/fonts\/[^"')]+\.woff2)["']?\)/g)) {
  css = css.replace(ref, `url("${await dataUri(path, 'font/woff2')}")`);
}

/**
 * Replace exactly one match, or stop the build: a silent miss would ship a broken page.
 * @param {string} text @param {RegExp} pattern @param {string} replacement
 */
function replaceOnce(text, pattern, replacement) {
  if (!pattern.test(text)) throw new Error(`build: ${pattern} not found in index.html`);
  return text.replace(pattern, () => replacement);
}

let html = await readFile('index.html', 'utf8');
html = replaceOnce(html, /<link rel="stylesheet" href="styles\.css"\s*\/?>/, `<style>\n${css}</style>`);
html = replaceOnce(html, /href="assets\/icon\.svg"/, `href="${await dataUri('assets/icon.svg', 'image/svg+xml')}"`);
html = replaceOnce(html, /<script type="module" src="src\/main\.js"><\/script>/, `<script>\n${script}</script>`);
html = replaceOnce(html, /<body>/, `<body data-sample="${await dataUri('assets/sample.jpg', 'image/jpeg')}">`);
if (/assets\/fonts\//.test(html)) throw new Error('build: a font was not inlined');

await rm('dist', { recursive: true, force: true }); // nothing stale gets deployed
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
await copyFile('assets/social.png', 'dist/social.png');
console.log(`dist/index.html  ${(html.length / 1024).toFixed(0)} kB`);
