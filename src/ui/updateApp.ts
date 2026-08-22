/**
 * Applying a waiting service-worker update — BRIEF §7.10.
 *
 * A plain `location.reload()` is not enough. With one tab open the old worker
 * still controls the page, so the new one stays in `waiting` and the reload
 * serves the old cache — the update bar would reappear forever.
 *
 * The sequence that actually works: flush any pending write, tell the waiting
 * worker to skip waiting, then reload once it has taken control.
 */
import { flush } from '../state/store';

const CONTROLLER_TIMEOUT_MS = 3000;

export async function applyUpdate(): Promise<void> {
  // Never lose a tick to an update.
  await flush();

  if (!('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting ?? null;

  if (waiting === null) {
    window.location.reload();
    return;
  }

  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true });
  waiting.postMessage('skip-waiting');

  // If the worker never takes control, reload anyway rather than leaving him
  // staring at a bar that does nothing.
  setTimeout(reloadOnce, CONTROLLER_TIMEOUT_MS);
}
