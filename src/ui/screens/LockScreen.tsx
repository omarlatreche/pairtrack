/**
 * Lock screen — the first thing seen on every launch (BRIEF §7.1).
 *
 * Deriving the key takes ~0.5s on purpose. The button shows that state rather
 * than pretending it is instant, because a UI that looks frozen gets tapped
 * again.
 */
import { useEffect, useState } from 'preact/hooks';
import { ThrottledError, unlock, WrongPassphraseError, type VaultMeta } from '../../crypto/vault';
import { LockIcon } from '../components/Icons';

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
            <strong>Unlocked, but the data could not be read</strong>
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

      <p class="field__hint" style={{ marginTop: '20px', textAlign: 'center' }}>
        Your job data is encrypted on this phone. There is no password reset.
      </p>
    </div>
  );
}
