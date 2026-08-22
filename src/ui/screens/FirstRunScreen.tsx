/**
 * First run — BRIEF §7.1, §9.6.
 *
 * The "there is no recovery" warning is the most important text in the app. It
 * is stated plainly, unmissably, and requires an explicit acknowledgement,
 * because the failure it describes is unrecoverable by anyone including us.
 */
import { useState } from 'preact/hooks';
import { createVault } from '../../crypto/vault';
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from '../../crypto/passphrase';
import { emptyVault, saveMeta, saveVault } from '../../data/repository';
import { WarnIcon } from '../components/Icons';

interface FirstRunScreenProps {
  readonly onReady: () => void;
}

export function FirstRunScreen({ onReady }: FirstRunScreenProps) {
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = assessPassphrase(passphrase);
  const longEnough = passphrase.length >= MIN_PASSPHRASE_LENGTH;
  const matches = passphrase !== '' && passphrase === confirmation;
  const canSubmit = longEnough && matches && acknowledged && !busy;

  async function submit(event: Event) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    try {
      const meta = await createVault(passphrase);
      await saveMeta(meta);

      const vault = emptyVault();
      vault.settings.engineerName = name.trim();
      await saveVault(vault);

      setPassphrase('');
      setConfirmation('');
      onReady();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not set up. Try again.');
      setBusy(false);
    }
  }

  return (
    <div class="panel">
      <h1 style={{ marginTop: 0, fontSize: '24px' }}>Set up PairTrack</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Everything stays on this phone, encrypted. There is no account and nothing is uploaded.
      </p>

      <form onSubmit={(event) => void submit(event)}>
        <label class="field">
          <span class="field__label">Your name</span>
          <input
            class="input"
            autocomplete="name"
            value={name}
            placeholder="Goes in the Completed By column"
            onInput={(event) => setName((event.target as HTMLInputElement).value)}
          />
        </label>

        <label class="field">
          <span class="field__label">Create a passphrase</span>
          <input
            type="password"
            class="input"
            autocomplete="new-password"
            value={passphrase}
            onInput={(event) => setPassphrase((event.target as HTMLInputElement).value)}
          />

          <div class="strength" aria-hidden="true">
            {[1, 2, 3, 4].map((level) => (
              <div
                key={level}
                class={`strength__bar${strength.score >= level ? ` strength__bar--on-${strength.score}` : ''}`}
              />
            ))}
          </div>
          <p class="strength__label" role="status">
            {passphrase === ''
              ? `At least ${MIN_PASSPHRASE_LENGTH} characters. Three or four unrelated words work well.`
              : `${strength.label}${strength.hint !== null ? ` — ${strength.hint}` : ''}`}
          </p>
        </label>

        <label class="field">
          <span class="field__label">Type it again</span>
          <input
            type="password"
            class="input"
            autocomplete="new-password"
            value={confirmation}
            onInput={(event) => setConfirmation((event.target as HTMLInputElement).value)}
          />
          {confirmation !== '' && !matches && (
            <p class="field__hint" style={{ color: 'var(--fail)' }}>
              These do not match.
            </p>
          )}
        </label>

        <div class="callout callout--danger">
          <strong>
            <WarnIcon size={16} /> There is no password reset
          </strong>
          <p>
            If you forget this passphrase your job data cannot be recovered by anyone, including
            you. Write it down somewhere safe and take backups.
          </p>
        </div>

        <label
          class="field"
          style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            style={{ width: '24px', height: '24px', marginTop: '2px', flex: 'none' }}
            onChange={(event) => setAcknowledged((event.target as HTMLInputElement).checked)}
          />
          <span>
            I understand that losing this passphrase means losing the data, and that no one can
            recover it.
          </span>
        </label>

        {error !== null && (
          <div class="callout callout--danger" role="alert">
            <p>{error}</p>
          </div>
        )}

        <button type="submit" class="button button--primary" disabled={!canSubmit}>
          {busy ? 'Setting up…' : 'Create and continue'}
        </button>
      </form>
    </div>
  );
}
