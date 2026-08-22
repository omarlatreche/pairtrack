/**
 * Auto-lock — BRIEF §9.4.
 *
 * Two triggers:
 *   1. Idle for N minutes (default 15, configurable 1-60).
 *   2. Backgrounded for more than 5 minutes.
 *
 * The second matters more in practice: the phone goes in a pocket far more
 * often than it sits untouched face-up. Backgrounding does NOT lock instantly —
 * he switches to the camera or a text mid-job and comes straight back, and
 * re-entering a 12-character passphrase in gloves would make him stop using the
 * app.
 */
import { lock } from './vault';

export const DEFAULT_IDLE_MINUTES = 15;
export const MIN_IDLE_MINUTES = 1;
export const MAX_IDLE_MINUTES = 60;

/** Grace period before a backgrounded app locks. */
const HIDDEN_GRACE_MS = 5 * 60_000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'focus'] as const;

export interface AutoLockHandle {
  /** Change the idle timeout without tearing the watcher down. */
  setIdleMinutes(minutes: number): void;
  /** Reset the idle countdown — call after any state change. */
  poke(): void;
  stop(): void;
}

export function startAutoLock(idleMinutes = DEFAULT_IDLE_MINUTES): AutoLockHandle {
  let idleMs = clampMinutes(idleMinutes) * 60_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function clearIdle() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function armIdle() {
    clearIdle();
    if (stopped) return;
    idleTimer = setTimeout(() => lock(), idleMs);
  }

  function onActivity() {
    if (document.visibilityState === 'visible') armIdle();
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // Stop the idle timer while hidden — a backgrounded tab is throttled and
      // its timers are unreliable — and start the shorter grace timer instead.
      clearIdle();
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      hiddenTimer = setTimeout(() => lock(), HIDDEN_GRACE_MS);
    } else {
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      armIdle();
    }
  }

  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, onActivity, { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  armIdle();

  return {
    setIdleMinutes(minutes: number) {
      idleMs = clampMinutes(minutes) * 60_000;
      armIdle();
    },
    poke: armIdle,
    stop() {
      stopped = true;
      clearIdle();
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_IDLE_MINUTES;
  return Math.min(MAX_IDLE_MINUTES, Math.max(MIN_IDLE_MINUTES, Math.round(minutes)));
}
