import { build } from 'esbuild';
import { copyFile, writeFile } from 'node:fs/promises';
await build({
  entryPoints: ['scripts/preview/viewer.ts'],
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'public/mnemo-slide-viewer.js',
  logLevel: 'warning',
});
await writeFile(
  'public/mnemo-slide-viewer.html',
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;width:100%;height:100%;overflow:auto;background:transparent;color:#a9a094;font:15px sans-serif}#slide{position:absolute;width:960px;height:540px;transform-origin:top left}</style></head><body><div id="slide"></div><script src="/mnemo-slide-viewer.js"></script></body></html>`,
);
// pdf.js renders slide previews and thumbnails off the main thread.
await copyFile(
  'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  'public/pdf.worker.min.mjs',
);
