import { defineConfig } from 'astro/config';

// The build worker parameterizes each build via env:
//   SF_OUTDIR     absolute output dir (per-build)
//   SF_SITE_URL   canonical https://domain
export default defineConfig({
  output: 'static',
  outDir: process.env.SF_OUTDIR || './dist',
  site: process.env.SF_SITE_URL || 'https://example.com',
  build: { inlineStylesheets: 'always' },
});
