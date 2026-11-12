// bundle.mjs - inline the report kit into one self-contained, shareable HTML file.
// Usage: node report-kit/bundle.mjs <in.html> <out.html>
// Local <link rel="stylesheet"> and <script src> tags are replaced by their file
// contents; remote ones (Google Fonts) stay as they are.
import fs from 'node:fs';
import path from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('usage: node bundle.mjs <in.html> <out.html>'); process.exit(2); }

const base = path.dirname(path.resolve(input));
const read = (ref) => fs.readFileSync(path.resolve(base, ref), 'utf8');
const isRemote = (ref) => /^(https?:)?\/\//.test(ref);

let html = fs.readFileSync(input, 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (tag, href) =>
  isRemote(href) ? tag : `<style>\n${read(href)}</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (tag, src) =>
  isRemote(src) ? tag : `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}</script>`);

fs.writeFileSync(output, html, 'utf8');
console.log(output);
