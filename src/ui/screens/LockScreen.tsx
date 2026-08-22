/**
 * Lock screen — the first thing seen on every launch (BRIEF §7.1).
 *
 * Deriving the key takes ~0.5s on purpose. The button shows that state rather
 * than pretending it is instant, because a UI that looks frozen gets tapped
 * again.
 */
import { useEffect, useState } from 'preact/hooks';
import { ThrottledError, unlock, WrongPassphraseError, type VaultMeta } from '../../crypto/vault';
import { restoreFromBackupText } from '../../data/restore';
import { LockIcon, WarnIcon } from '../components/Icons';

interface LockScreenProps {
  readonly meta: VaultMeta;
  /** Set when a correct passphrase still could not open the store. */
  readonly fatalError?: string | null;
  readonly onUnlocked: () => void;
}

export function LockScreen({ meta, fatalError, onUnlocked }: LockScreenProps) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);

  // Restore lives here as well as in Settings, because this is the screen that
  // tells him to use it. When the verifier accepts a passphrase and the store
  // still will not decrypt, Settings is unreachable — it needs a loaded vault,
  // which is exactly what has failed.
  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [restorePass, setRestorePass] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function onRestoreFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    try {
      setRestoreText(await file.text());
      setRestoreError(null);
    } catch {
      setRestoreError('Could not read that file.');
    }
  }

  async function doRestore() {
    if (restoreText === null || restorePass === '') return;
    setRestoreBusy(true);
    setRestoreError(null);
    try {
      await restoreFromBackupText(restoreText, restorePass);
      setRestoreText(null);
      setRestorePass('');
      onUnlocked();
    } catch (caught) {
      setRestoreError(
        caught instanceof Error ? caught.message : 'Could not restore that backup.',
      );
    } finally {
      setRestoreBusy(false);
    }
  }

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const timer = setTimeout(() => setWaitSeconds((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  async function submit(event: Event) {
    event.preventDefault();
    if (busy || passphrase === '') return;

    setBusy(true);
    setError(null);

    try {
      await unlock(passphrase, meta);
      setPassphrase('');
      onUnlocked();
    } catch (caught) {
      if (caught instanceof ThrottledError) {
        setWaitSeconds(Math.ceil(caught.remainingMs / 1000));
        setError('Too many attempts. Wait a moment and try again.');
      } else if (caught instanceof WrongPassphraseError) {
        setError('Incorrect passphrase');
      } else {
        setError('Could not unlock. Try again.');
      }
      setPassphrase('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="panel panel--centred">
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <LockIcon size={48} />
        <h1 style={{ margin: '12px 0 4px', fontSize: '24px' }}>PairTrack</h1>
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>Locked</p>
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <label class="field">
          <span class="field__label">Passphrase</span>
          <input
            type="password"
            class="input"
            autocomplete="current-password"
            autofocus
            enterKeyHint="go"
            value={passphrase}
            disabled={busy || waitSeconds > 0}
            onInput={(event) => setPassphrase((event.target as HTMLInputElement).value)}
          />
        </label>

        {fatalError != null && (
          <div class="callout callout--danger" role="alert">
            <strong>
              <WarnIcon size={16} /> Unlocked, but the data could not be read
            </strong>
            <p>{fatalError}</p>
          </div>
        )}

        {error !== null && (
          <div class="callout callout--danger" role="alert">
            <p>
              {error}
              {waitSeconds > 0 && ` (${waitSeconds}s)`}
            </p>
          </div>
        )}

        <button
          type="submit"
          class="button button--primary"
          disabled={busy || passphrase === '' || waitSeconds > 0}
        >
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>

      {/*
        Only offered when the store itself has failed. On an ordinary lock
        screen this would be an invitation to overwrite a perfectly good vault
        with an older backup, which is not a button anyone needs in a hurry.
      */}
      {fatalError != null && (
        <section class="section">
          <h2 class="section__title">Restore from a backup</h2>

          {restoreText === null ? (
            <>
              <p class="field__hint" style={{ marginBottom: '12px' }}>
                Choose the most recent <code>.ptbak</code> file you have. You will need the
                passphrase that was in use when you made it.
              </p>
              <label class="button">
                Choose a .ptbak file
                <input
                  type="file"
                  accept=".ptbak,application/json"
                  class="visually-hidden"
                  onChange={(event) => void onRestoreFile(event)}
                />
              </label>
            </>
          ) : (
            <>
              <div class="callout callout--warn">
                <strong>This replaces what is on the phone</strong>
                <p>
                  Which is the point — what is on the phone cannot be read. Afterwards this
                  device unlocks with the passphrase that encrypted the backup.
                </p>
              </div>

              <label class="field">
                <span class="field__label">Passphrase for that backup</span>
                <input
                  type="password"
                  class="input"
                  autocomplete="current-password"
                  value={restorePass}
                  disabled={restoreBusy}
                  onInput={(event) => setRestorePass((event.target as HTMLInputElement).value)}
                />
              </label>

              {restoreError !== null && (
                <div class="callout callout--danger" role="alert">
                  <p>{restoreError}</p>
                </div>
              )}

              <button
                type="button"
                class="button button--primary"
                disabled={restoreBusy || restorePass === ''}
                onClick={() => void doRestore()}
              >
                {restoreBusy ? 'Restoring…' : 'Restore'}
              </button>
              <button
                type="button"
                class="button"
                disabled={restoreBusy}
                onClick={() => {
                  setRestoreText(null);
                  setRestorePass('');
                  setRestoreError(null);
                }}
              >
                Cancel
              </button>
            </>
          )}
        </section>
      )}

      <p class="field__hint" style={{ marginTop: '20px', textAlign: 'center' }}>
        Your job data is encrypted on this phone. There is no password reset.
      </p>
    </div>
  );
}
