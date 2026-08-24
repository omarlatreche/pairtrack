import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Short commit of the build, shown in Settings next to the version.
 *
 * `APP_VERSION` is bumped by hand on release, so every build between releases
 * reported the same string — and when he said a bug was still happening there
 * was no way to tell whether he was running the fix. A PWA deliberately serves
 * its cached copy until the "Update available" bar is tapped, so "which build
 * is on the phone" is a real question that needs a real answer.
 *
 * Falls back to `dev` outside a git checkout; never fails the build.
 */
function buildCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

/** Tunnel providers allowed to reach a locally-started dev/preview server. */
const TUNNEL_HOSTS = [
  '.trycloudflare.com',
  '.ngrok-free.app',
  '.ngrok.io',
  '.loca.lt',
  '.tunnelmole.net',
];

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
    define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) },
    plugins: [preact()],
    build: {
      target: 'es2022',
      sourcemap: false,
      // Vite's modulepreload polyfill calls fetch(). It is same-origin and
      // harmless, but it is the only network call in the whole bundle, and
      // "zero network APIs" is a much easier guarantee to verify than "one
      // network call, and here is why it is fine". Every browser that supports
      // the es2022 target supports modulepreload natively.
      modulePreload: { polyfill: false },
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
    /*
     * Tunnel hostnames, for testing on a real phone.
     *
     * The app needs a secure context — WebCrypto does not exist without one —
     * so `http://192.168.x.x:5173` from a phone will not run it. The practical
     * way round that without deploying is a throwaway tunnel:
     *
     *     npx cloudflared tunnel --url http://localhost:4173
     *
     * Vite checks the Host header and rejects anything not listed here, so the
     * tunnel would otherwise return "Blocked request. This host is not
     * allowed." A leading dot matches subdomains.
     *
     * Scope of this: it only affects a server the developer starts on their own
     * machine, deliberately. It is not part of the deployed app, and it names
     * specific tunnel providers rather than allowing any host.
     */
    server: {
      port: 5173,
      host: true,
      allowedHosts: TUNNEL_HOSTS,
    },
    preview: {
      port: 4173,
      host: true,
      allowedHosts: TUNNEL_HOSTS,
    },
  };
});
