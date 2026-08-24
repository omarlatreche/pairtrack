/**
 * The app shell — BRIEF §7.2.
 *
 * Owns three things and delegates the rest:
 *   1. which screen is showing
 *   2. the header (pack, progress ring, session counter, lock button)
 *   3. wiring lock state to the store, so locking really does clear decrypted
 *      data from memory and from the DOM
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { startAutoLock, type AutoLockHandle } from '../crypto/autolock';
import { isUnlocked, lock, onLockStateChange, type VaultMeta } from '../crypto/vault';
import { deriveStatus } from '../data/transitions';
import { hasVault, loadMeta, loadVault } from '../data/repository';
import {
  activePack,
  clearDecryptedState,
  dismissUndo,
  flush,
  performUndo,
  setState,
  updateSettings,
} from '../state/store';
import { useStore } from '../state/useStore';
import { formatDuration } from './components/format';
import { LockIcon, MoonIcon, SettingsIcon, SunIcon, UndoIcon } from './components/Icons';
import { applyUpdate } from './updateApp';
import { FirstRunScreen } from './screens/FirstRunScreen';
import { ImportScreen } from './screens/ImportScreen';
import { JobListScreen } from './screens/JobListScreen';
import { LockScreen } from './screens/LockScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const state = useStore();
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [autoLock, setAutoLock] = useState<AutoLockHandle | null>(null);

  // --- Boot -----------------------------------------------------------------
  useEffect(() => {
    void (async () => {
      const exists = await hasVault();
      if (!exists) {
        setState({ screen: { name: 'first-run' } });
        return;
      }
      setMeta(await loadMeta());
      setState({ screen: { name: 'lock' } });
    })();
  }, []);

  // --- Lock state -----------------------------------------------------------
  useEffect(() => {
    return onLockStateChange((lockState) => {
      if (lockState === 'locked') {
        // Drop everything decrypted. The key is already gone; this clears the
        // data it protected from memory and from the DOM (BRIEF §9.4).
        clearDecryptedState();
        autoLock?.stop();
        setAutoLock(null);
      }
    });
  }, [autoLock]);

  // Start the idle watcher once unlocked; keep its timeout in step with settings.
  useEffect(() => {
    if (state.vault === null) return;
    if (autoLock === null) {
      setAutoLock(startAutoLock(state.vault.settings.autoLockMinutes));
    } else {
      autoLock.setIdleMinutes(state.vault.settings.autoLockMinutes);
    }
  }, [state.vault?.settings.autoLockMinutes, state.vault === null]);

  // --- Theme ----------------------------------------------------------------
  const theme = state.vault?.settings.theme ?? 'dark';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'sunlight' ? '#ffffff' : '#0d1117');
  }, [theme]);

  // --- Never lose a change to a backgrounded tab ----------------------------
  useEffect(() => {
    function onHide() {
      void flush();
    }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  async function afterUnlock() {
    try {
      const vault = await loadVault();
      setState({
        vault: vault ?? null,
        screen: { name: 'list' },
        error: null,
        session: { changes: 0, startedAt: Date.now() },
      });
    } catch (caught) {
      // The passphrase was RIGHT — the verifier accepted it — and the store
      // still would not open. That means the stored blob and the stored
      // verifier disagree, which should be impossible now the re-key is one
      // transaction, but if it ever happens he must not be dumped back on the
      // lock screen with no message, silently, as though he had mistyped.
      // That is how someone concludes they have forgotten their own passphrase.
      console.error('pairtrack: unlocked but could not read the store', caught);
      lock();
      setState({
        screen: { name: 'lock' },
        error:
          'That passphrase was accepted, but the stored data could not be read. ' +
          'Do not wipe. Restore your most recent .ptbak backup instead.',
      });
    }
  }

  const pack = activePack();

  const progress = useMemo(() => {
    if (pack === null) return { done: 0, total: 0 };
    const done = pack.jobs.filter((job) => deriveStatus(job.progress) !== 'outstanding').length;
    return { done, total: pack.jobs.length };
  }, [pack]);

  // --- Screens --------------------------------------------------------------

  if (state.screen.name === 'loading') {
    return (
      <div class="app">
        <div class="empty">
          <div class="spinner" />
        </div>
      </div>
    );
  }

  if (state.screen.name === 'first-run') {
    return (
      <div class="app">
        <FirstRunScreen
          onReady={() => {
            void afterUnlock();
            void loadMeta().then(setMeta);
          }}
        />
      </div>
    );
  }

  if (state.screen.name === 'lock' || !isUnlocked()) {
    return (
      <div class="app">
        {meta === null ? (
          <div class="empty">
            <div class="spinner" />
          </div>
        ) : (
          <LockScreen
            meta={meta}
            fatalError={state.error}
            onUnlocked={() => void afterUnlock()}
          />
        )}
      </div>
    );
  }

  // Bound outside the callback: narrowing on `state.screen.name` does not
  // survive into a closure, because TypeScript cannot know when it runs.

  return (
    <div class="app">
      {state.updateReady && (
        <div class="updatebar" role="status">
          An update is ready.
          <button type="button" onClick={() => void applyUpdate()}>
            Apply
          </button>
        </div>
      )}

      <header class="header">
        {pack !== null && (
          <ProgressRing done={progress.done} total={progress.total} />
        )}

        <div class="header__title">
          <span class="header__pack">{pack?.name ?? 'PairTrack'}</span>
          <span class="header__session">
            {state.session.changes} done this session ·{' '}
            {formatDuration(Date.now() - state.session.startedAt)}
          </span>
        </div>

        <div class="header__actions">
          <button
            type="button"
            class="icon-button"
            aria-label={theme === 'dark' ? 'Switch to sunlight mode' : 'Switch to dark mode'}
            onClick={() =>
              updateSettings((current) => ({
                ...current,
                theme: current.theme === 'dark' ? 'sunlight' : 'dark',
              }))
            }
          >
            {theme === 'dark' ? <SunIcon size={22} /> : <MoonIcon size={22} />}
          </button>

          <button
            type="button"
            class="icon-button"
            aria-label="Settings"
            onClick={() => setState({ screen: { name: 'settings' } })}
          >
            <SettingsIcon size={22} />
          </button>

          {/* Permanent and obvious — BRIEF §7.2. */}
          <button
            type="button"
            class="icon-button icon-button--danger"
            aria-label="Lock PairTrack"
            onClick={() => {
              void flush().then(() => lock());
            }}
          >
            <LockIcon size={22} />
          </button>
        </div>
      </header>

      <main class="screen">
        {state.screen.name === 'list' && <JobListScreen state={state} />}

        {state.screen.name === 'import' && <ImportScreen />}
        {state.screen.name === 'settings' && <SettingsScreen state={state} />}
      </main>

      {state.undo !== null && (
        <div class="toast" role="status">
          <span class="toast__text">
            {state.undo.label}
            {state.undo.previous.length === 1 ? ` · job ${state.undo.previous[0]?.seq}` : ''}
          </span>
          <button type="button" class="toast__undo" onClick={performUndo}>
            <UndoIcon size={18} />
            Undo
          </button>
          <button
            type="button"
            class="icon-button"
            aria-label="Dismiss"
            onClick={dismissUndo}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

/** Progress ring: done / total at a glance, in the header (BRIEF §7.2). */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const fraction = total === 0 ? 0 : done / total;

  return (
    <div class="ring" role="img" aria-label={`${done} of ${total} jobs completed`}>
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <circle class="ring__track" cx="23" cy="23" r={radius} fill="none" stroke-width="4" />
        <circle
          class="ring__fill"
          cx="23"
          cy="23"
          r={radius}
          fill="none"
          stroke-width="4"
          stroke-dasharray={circumference}
          stroke-dashoffset={circumference * (1 - fraction)}
        />
      </svg>
      {/*
        Stacked, not `done/total` on one line. On one line the label outgrows the
        ring as soon as the done count reaches two digits — measured: 41px of
        text inside a 38px inner circle at `17/442`, and 48.5px, wider than the
        whole 46px ring, at `103/442`. Stacked it fits at any pack size, and the
        digits get bigger rather than smaller.
      */}
      <span class="ring__label" aria-hidden="true">
        <span class="ring__done">{done}</span>
        <span class="ring__total">{total}</span>
      </span>
    </div>
  );
}
