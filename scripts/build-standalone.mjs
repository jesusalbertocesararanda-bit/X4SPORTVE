import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const indexHtmlPath = path.join(distDir, 'index.html');

if (!fs.existsSync(indexHtmlPath)) {
  throw new Error('dist/index.html not found. Run vite build first.');
}

let html = fs.readFileSync(indexHtmlPath, 'utf8');

// Inline built CSS inside <head>
const cssMatch = html.match(
  /<link\s+rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/i,
);
if (cssMatch) {
  const cssRel = cssMatch[1].replace(/^\//, '');
  const cssPath = path.join(distDir, cssRel);
  if (fs.existsSync(cssPath)) {
    const cssContent = fs
      .readFileSync(cssPath, 'utf8')
      .replace(/<\/style/gi, '<\\/style');
    html = html.replace(cssMatch[0], () => `<style>${cssContent}</style>`);
  }
}

// Extract built JS bundle, convert ESM -> classic IIFE for file:// compatibility, and inline at end of <body>
const jsMatch = html.match(
  /<script\s+type="module"[^>]*src="([^"]+\.js)"[^>]*><\/script>/i,
);
if (!jsMatch) {
  throw new Error('Could not locate built module script tag in dist/index.html.');
}

const jsRel = jsMatch[1].replace(/^\//, '');
const jsPath = path.join(distDir, jsRel);
const rawJs = fs.readFileSync(jsPath, 'utf8');

const iifeResult = transformSync(rawJs, {
  format: 'iife',
  target: 'es2020',
  minify: true,
});

const safeInlineJs = iifeResult.code.replace(/<\/script/gi, '<\\/script');

// Remove module script from <head> and inject classic IIFE script right before </body>
html = html.replace(jsMatch[0], () => '');
html = html.replace(
  '</body>',
  () => `<script>${safeInlineJs}</script>\n  </body>`,
);

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(distDir, 'x4sport-standalone.html'), html, 'utf8');
fs.writeFileSync(path.join(publicDir, 'x4sport-standalone.html'), html, 'utf8');
fs.writeFileSync(path.join(distDir, 'x4sport-app.html'), html, 'utf8');
fs.writeFileSync(path.join(publicDir, 'x4sport-app.html'), html, 'utf8');

const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`Built standalone single-file HTML: x4sport-app.html & x4sport-standalone.html (${sizeKb} KB)`);
