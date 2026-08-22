/**
 * Entry point.
 *
 * Registers the service worker and surfaces a waiting update as a non-blocking
 * bar. Never auto-reloads: a reload mid-job at a frame is exactly the wrong
 * moment (BRIEF §7.10).
 */
import { render } from 'preact';
import { App } from './ui/App';
import { setState } from './state/store';
import { setBeforeAutoLock } from './crypto/autolock';
import { flushSave } from './data/repository';
import './ui/styles.css';

// An automatic lock must not drop a change still sitting in the debounce
// window. src/crypto/ deliberately does not import src/data/, so the wiring
// happens here instead.
setBeforeAutoLock(flushSave);

const root = document.getElementById('app');
if (root === null) throw new Error('Missing #app');

/**
 * WebCrypto only exists in a secure context, and the whole app is built on it.
 *
 * The case that actually happens: the dev server is started with `--host` and
 * the phone opens `http://192.168.x.x:5173`. That is not a secure context, so
 * `crypto.subtle` is `undefined` and the first thing the app does — derive a
 * key — throws "Cannot read properties of undefined". That reads like a broken
 * app rather than a wrong URL, and it is the first thing anyone hits when they
 * try PairTrack on a real phone.
 *
 * `localhost` counts as secure, so desktop development is unaffected.
 */
if (typeof crypto === 'undefined' || crypto.subtle === undefined) {
  root.innerHTML = `
    <div class="panel panel--centred">
      <div class="callout callout--danger">
        <strong>PairTrack needs a secure connection</strong>
        <p>
          Your browser only allows encryption over <code>https://</code>, or from
          <code>localhost</code>. This page was opened over plain <code>http://</code>,
          so there is no way to encrypt your job data — and PairTrack will not run
          without it.
        </p>
        <p>Open it over https, or install it from wherever it is deployed.</p>
      </div>
    </div>`;
} else {
  render(<App />, root);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        if (registration.waiting !== null) setState({ updateReady: true });

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (installing === null) return;
          installing.addEventListener('statechange', () => {
            // A worker that reaches "installed" while another controls the page
            // is a new version waiting its turn.
            if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
              setState({ updateReady: true });
            }
          });
        });
      })
      .catch((error: unknown) => {
        // No service worker means no offline install, but the app still works
        // for this session. Never block startup on it.
        console.warn('pairtrack: service worker registration failed', error);
      });
  });
}
