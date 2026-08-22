import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Vite config.
 *
 * `base` is env-driven so the same bundle deploys to all three hosting options
 * in BRIEF §8:
 *   GitHub Pages project site → PAIRTRACK_BASE=/pairtrack/
 *   Cloudflare Pages / root   → PAIRTRACK_BASE=/          (the default)
 *
 * Nothing here may introduce a network origin — scripts/check-no-external-origins.mjs
 * fails the build if it does.
 */
export default defineConfig(() => {
  const base = process.env.PAIRTRACK_BASE ?? '/';

  return {
    base,
    plugins: [preact()],
    build: {
      target: 'es2022',
      sourcemap: false,
      // 442 jobs is nothing, but xlsx is ~900KB. It is dynamically imported so
      // it never blocks first paint; the service worker precaches it so import
      // and export still work offline.
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/xlsx')) return 'sheetjs';
            return undefined;
          },
        },
      },
    },
    worker: {
      format: 'es',
    },
    server: {
      port: 5173,
      host: true,
    },
    preview: {
      port: 4173,
      host: true,
    },
  };
});
