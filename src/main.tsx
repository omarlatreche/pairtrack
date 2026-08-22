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
import './ui/styles.css';

const root = document.getElementById('app');
if (root === null) throw new Error('Missing #app');

render(<App />, root);

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
