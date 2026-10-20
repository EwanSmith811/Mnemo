import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'officeparser', 'ppt-codec', 'reamkit'],
  turbopack: { root: process.cwd() },
  // Legacy parsing runs outside the bundle in a Node worker. Ship its modules
  // explicitly so filesystem resolution also works in Vercel deployments.
  outputFileTracingIncludes: {
    '/api/upload': [
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
