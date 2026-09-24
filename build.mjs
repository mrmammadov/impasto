// Bundles the app into one self-contained HTML file: dist/loose-brush.html
// (JS, CSS and the sample picture inlined). Use it to publish as a claude.ai artifact
// or to share a file that opens with a double-click.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const js = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: process.argv.includes('--minify'),
  write: false,
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('styles.css', 'utf8');
const sample = (await readFile('assets/sample.jpg')).toString('base64');
let html = await readFile('index.html', 'utf8');

html = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>\n${script}</script>`)
  .replace('<body>', () => `<body data-sample="data:image/jpeg;base64,${sample}">`);

await mkdir('dist', { recursive: true });
await writeFile('dist/loose-brush.html', html);
console.log(`dist/loose-brush.html  ${(html.length / 1024).toFixed(0)} kB`);
