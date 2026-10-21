import type { NextConfig } from 'next';

const pdfParseFiles = [
  './node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  './node_modules/@napi-rs/canvas/**/*',
  './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
];

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'pdf-parse',
    '@napi-rs/canvas',
    'officeparser',
    'ppt-codec',
    'reamkit',
  ],
  turbopack: { root: process.cwd() },
  // Legacy parsing runs outside the bundle in a Node worker. Ship its modules
  // explicitly so filesystem resolution also works in Vercel deployments.
  outputFileTracingIncludes: {
    // pdf-parse loads its own pdf.js worker by dynamic import and polyfills
    // DOMMatrix from a native canvas module; neither is found by tracing.
    '/api/learn/*/source': pdfParseFiles,
    '/api/upload': [
      ...pdfParseFiles,
      './src/lib/powerpoint-worker.mjs',
      './node_modules/ppt-codec/**/*',
      './node_modules/archive-codec/**/*',
      './node_modules/byte-codec/**/*',
      './node_modules/document-schema.js/**/*',
      './node_modules/fflate/**/*',
      './node_modules/zod/**/*',
    ],
  },
};

export default nextConfig;
