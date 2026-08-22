/**
 * Settings — BRIEF §7.1, §9.5, §9.6.
 *
 * Engineer name, auto-lock timeout, editable fail reasons, pack switching,
 * backup/restore, passphrase change, and the confirm-by-typing wipe.
 */
import { useState } from 'preact/hooks';
import { MAX_IDLE_MINUTES, MIN_IDLE_MINUTES } from '../../crypto/autolock';
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from '../../crypto/passphrase';
import { adoptKey, lock, rederiveForNewPassphrase } from '../../crypto/vault';
import { slugifyReason } from '../../data/failReasons';
import {
  flushSave,
  saveMeta,
  saveVault,
  wipeEverything,
} from '../../data/repository';
import { parseBackup, restoreBackup } from '../../export/backup';
import { commit, getState, setState, updateSettings, type AppState } from '../../state/store';
import { formatStamp } from '../components/format';
import { BackIcon, LockIcon, WarnIcon } from '../components/Icons';
import { APP_VERSION } from '../../version';

export function SettingsScreen({ state }: { state: AppState }) {
  const vault = state.vault;
  const settings = vault?.settings;

  const [newReason, setNewReason] = useState('');
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [changeOpen, setChangeOpen] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [newPassConfirm, setNewPassConfirm] = useState('');

  const [restorePass, setRestorePass] = useState('');
  const [restoreText, setRestoreText] = useState<string | null>(null);

  if (vault === null || settings === undefined) {
    return <div class="empty">Locked.</div>;
  }

  async function changePassphrase() {
    if (newPass.length < MIN_PASSPHRASE_LENGTH || newPass !== newPassConfirm) return;

    setBusy('Changing passphrase');
    setError(null);
    try {
      // Re-derive, re-encrypt with the new key, then persist the new meta.
      // If the re-encrypt fails the old meta is untouched and he keeps access.
      const { meta, key } = await rederiveForNewPassphrase(newPass);
      const current = getState().vault;
      if (current === null) throw new Error('Locked');

      await saveVault(current, key);
      await saveMeta(meta);
      adoptKey(key);

      setNewPass('');
      setNewPassConfirm('');
      setChangeOpen(false);
      setMessage('Passphrase changed. Take a fresh backup — old backups still use the old one.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the passphrase.');
    } finally {
      setBusy(null);
    }
  }

  async function onRestoreFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;

    try {
      setRestoreText(await file.text());
      setError(null);
      setMessage(null);
    } catch {
      setError('Could not read that file.');
    }
  }

  async function doRestore() {
    if (restoreText === null) return;

    setBusy('Restoring backup');
    setError(null);
    try {
      const parsed = parseBackup(restoreText);
      const restored = await restoreBackup(parsed, restorePass);

      // Replace in-memory state and write it through under the CURRENT key, so
      // the restored data is readable with the passphrase he uses on this phone.
      commit(() => restored);
      await flushSave();

      setRestoreText(null);
      setRestorePass('');
      setMessage(`Restored ${restored.packs.length} pack(s) from the backup.`);
      setState({ screen: { name: 'list' } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore that backup.');
    } finally {
      setBusy(null);
    }
  }

  async function doWipe() {
    setBusy('Wiping');
    try {
      await wipeEverything();
      lock();
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not wipe.');
      setBusy(null);
    }
  }

  const strength = assessPassphrase(newPass);

  return (
    <div class="panel">
      <button
        type="button"
        class="button"
        style={{ marginBottom: '16px' }}
        onClick={() => setState({ screen: { name: 'list' } })}
      >
        <BackIcon size={20} />
        Back
      </button>

      <h1 style={{ marginTop: 0, fontSize: '22px' }}>Settings</h1>

      {message !== null && (
        <div class="callout callout--info" role="status">
          <p>{message}</p>
        </div>
      )}
      {error !== null && (
        <div class="callout callout--danger" role="alert">
          <p>{error}</p>
        </div>
      )}
      {busy !== null && (
        <div class="callout">
          <p>{busy}…</p>
        </div>
      )}

      <section class="section">
        <h2 class="section__title">You</h2>
        <label class="field">
          <span class="field__label">Name</span>
          <input
            class="input"
            value={settings.engineerName}
            onInput={(event) =>
              updateSettings((current) => ({
                ...current,
                engineerName: (event.target as HTMLInputElement).value,
              }))
            }
          />
          <p class="field__hint">Filled into Completed By when you finish a job.</p>
        </label>
      </section>

      <section class="section">
        <h2 class="section__title">Display</h2>
        <div class="segmented">
          <button
            type="button"
            class="segmented__option"
            aria-pressed={settings.theme === 'dark'}
            onClick={() => updateSettings((current) => ({ ...current, theme: 'dark' }))}
          >
            Dark
          </button>
          <button
            type="button"
            class="segmented__option"
            aria-pressed={settings.theme === 'sunlight'}
            onClick={() => updateSettings((current) => ({ ...current, theme: 'sunlight' }))}
          >
            Sunlight
          </button>
        </div>
        <p class="field__hint">Sunlight is high-contrast for reading the screen in direct sun.</p>
      </section>

      <section class="section">
        <h2 class="section__title">Security</h2>

        <label class="field">
          <span class="field__label">Lock after {settings.autoLockMinutes} minutes idle</span>
          <input
            type="range"
            min={MIN_IDLE_MINUTES}
            max={MAX_IDLE_MINUTES}
            value={settings.autoLockMinutes}
            style={{ width: '100%', height: '44px' }}
            onInput={(event) =>
              updateSettings((current) => ({
                ...current,
                autoLockMinutes: Number((event.target as HTMLInputElement).value),
              }))
            }
          />
          <p class="field__hint">
            The app also locks after 5 minutes in the background, whatever this is set to.
          </p>
        </label>

        <button type="button" class="button" onClick={() => lock()}>
          <LockIcon size={20} />
          Lock now
        </button>

        {!changeOpen ? (
          <button type="button" class="button" onClick={() => setChangeOpen(true)}>
            Change passphrase
          </button>
        ) : (
          <>
            <label class="field">
              <span class="field__label">New passphrase</span>
              <input
                type="password"
                class="input"
                autocomplete="new-password"
                value={newPass}
                onInput={(event) => setNewPass((event.target as HTMLInputElement).value)}
              />
              <p class="strength__label">
                {newPass === ''
                  ? `At least ${MIN_PASSPHRASE_LENGTH} characters.`
                  : `${strength.label}${strength.hint !== null ? ` — ${strength.hint}` : ''}`}
              </p>
            </label>
            <label class="field">
              <span class="field__label">Type it again</span>
              <input
                type="password"
                class="input"
                autocomplete="new-password"
                value={newPassConfirm}
                onInput={(event) => setNewPassConfirm((event.target as HTMLInputElement).value)}
              />
            </label>
            <button
              type="button"
              class="button button--primary"
              disabled={
                busy !== null || newPass.length < MIN_PASSPHRASE_LENGTH || newPass !== newPassConfirm
              }
              onClick={() => void changePassphrase()}
            >
              Change it
            </button>
            <button type="button" class="button" onClick={() => setChangeOpen(false)}>
              Cancel
            </button>
          </>
        )}
      </section>

      <section class="section">
        <h2 class="section__title">Backup</h2>
        <p class="field__hint" style={{ marginBottom: '12px' }}>
          {settings.lastBackupAt === null
            ? 'You have never taken a backup.'
            : `Last backup ${formatStamp(settings.lastBackupAt)}.`}{' '}
          {settings.changesSinceBackup > 0 &&
            `${settings.changesSinceBackup} change${settings.changesSinceBackup === 1 ? '' : 's'} since then.`}
        </p>

        <label class="button">
          Restore from a .ptbak file
          <input
            type="file"
            accept=".ptbak,application/json"
            class="visually-hidden"
            onChange={(event) => void onRestoreFile(event)}
          />
        </label>

        {restoreText !== null && (
          <>
            <div class="callout callout--warn">
              <strong>
                <WarnIcon size={16} /> Restoring replaces everything
              </strong>
              <p>Every pack and all progress currently on this phone will be replaced.</p>
            </div>
            <label class="field">
              <span class="field__label">Passphrase that encrypted the backup</span>
              <input
                type="password"
                class="input"
                autocomplete="current-password"
                value={restorePass}
                onInput={(event) => setRestorePass((event.target as HTMLInputElement).value)}
              />
            </label>
            <button
              type="button"
              class="button button--danger"
              disabled={busy !== null || restorePass === ''}
              onClick={() => void doRestore()}
            >
              Restore
            </button>
            <button type="button" class="button" onClick={() => setRestoreText(null)}>
              Cancel
            </button>
          </>
        )}
      </section>

      <section class="section">
        <h2 class="section__title">Fail reasons</h2>
        <p class="field__hint" style={{ marginBottom: '12px' }}>
          These are the one-tap buttons when you fail a job. Change the wording to whatever you
          would actually write — the stored value does not change when you rename one.
        </p>

        {settings.failReasons.map((reason, index) => (
          <div class="mapping-row" key={reason.code}>
            <input
              class="input"
              value={reason.label}
              aria-label={`Label for ${reason.code}`}
              onInput={(event) => {
                const label = (event.target as HTMLInputElement).value;
                updateSettings((current) => ({
                  ...current,
                  failReasons: current.failReasons.map((r, i) => (i === index ? { ...r, label } : r)),
                }));
              }}
            />
            <button
              type="button"
              class="button"
              style={{ minHeight: '44px' }}
              onClick={() =>
                updateSettings((current) => ({
                  ...current,
                  failReasons: current.failReasons.map((r, i) =>
                    i === index ? { ...r, enabled: !r.enabled } : r,
                  ),
                }))
              }
            >
              {reason.enabled ? 'Hide' : 'Show'}
            </button>
          </div>
        ))}

        <div class="mapping-row">
          <input
            class="input"
            placeholder="Add your own reason"
            value={newReason}
            onInput={(event) => setNewReason((event.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="button"
            style={{ minHeight: '44px' }}
            disabled={newReason.trim() === ''}
            onClick={() => {
              const label = newReason.trim();
              updateSettings((current) => ({
                ...current,
                failReasons: [
                  ...current.failReasons,
                  { code: slugifyReason(label), label, enabled: true },
                ],
              }));
              setNewReason('');
            }}
          >
            Add
          </button>
        </div>
      </section>

      {vault.packs.length > 0 && (
        <section class="section">
          <h2 class="section__title">Job packs</h2>
          {vault.packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              class="sheet__option"
              aria-pressed={pack.id === vault.activePackId}
              onClick={() => commit((current) => ({ ...current, activePackId: pack.id }))}
            >
              <span>
                {pack.name}
                <br />
                <small style={{ fontWeight: 400, opacity: 0.75 }}>
                  {pack.jobs.length} jobs · imported {formatStamp(pack.lastImportedAt)}
                </small>
              </span>
            </button>
          ))}
        </section>
      )}

      <section class="section">
        <h2 class="section__title">Danger</h2>
        <div class="callout callout--danger">
          <strong>
            <WarnIcon size={16} /> Wipe everything on this phone
          </strong>
          <p>
            Every pack, all progress and the passphrase. This cannot be undone and there is no
            recovery. Take a backup first.
          </p>
        </div>
        <label class="field">
          <span class="field__label">Type WIPE to confirm</span>
          <input
            class="input"
            value={wipeConfirm}
            onInput={(event) => setWipeConfirm((event.target as HTMLInputElement).value)}
          />
        </label>
        <button
          type="button"
          class="button button--danger"
          disabled={wipeConfirm !== 'WIPE' || busy !== null}
          onClick={() => void doWipe()}
        >
          Wipe everything
        </button>
      </section>

      <section class="section">
        <h2 class="section__title">About</h2>
        <p class="field__hint">
          PairTrack {APP_VERSION}. No account, no server, no network. Your job data is encrypted
          on this phone and never leaves it unless you export it.
        </p>
      </section>
    </div>
  );
}
