/**
 * Settings — BRIEF §7.1, §9.5, §9.6.
 *
 * Engineer name, auto-lock timeout, malformed-row corrections, pack switching,
 * backup/restore, passphrase change, and the confirm-by-typing wipe.
 */
import { useState } from 'preact/hooks';
import { MAX_IDLE_MINUTES, MIN_IDLE_MINUTES } from '../../crypto/autolock';
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from '../../crypto/passphrase';
import { lock } from '../../crypto/vault';
import { changePassphrase as runChangePassphrase } from '../../data/changePassphrase';
import { flushSave, wipeEverything } from '../../data/repository';
import { restoreFromBackupText } from '../../data/restore';
import { correctSourceValue } from '../../state/actions';
import { activePack, commit, getState, setState, updateSettings, type AppState } from '../../state/store';
import { headerForRole } from '../../import/columns';
import { formatStamp } from '../components/format';
import { BackIcon, LockIcon, WarnIcon } from '../components/Icons';
import { APP_VERSION, BUILD_COMMIT } from '../../version';

export function SettingsScreen({ state }: { state: AppState }) {
  const vault = state.vault;
  const settings = vault?.settings;

  const pack = activePack();
  const barPairColumn = pack === null ? null : headerForRole(pack.columnMapping, 'barPair');
  const oldEquipmentColumn = pack === null ? null : headerForRole(pack.columnMapping, 'oldEquipment');

  /**
   * One correction field per defect, pointed at the column that actually caused
   * it. Offering a bar-pair box for a malformed equipment reference would just
   * be a box that cannot fix the problem it sits under.
   */
  const corrections = (pack?.jobs ?? []).flatMap((job) =>
    job.defects.flatMap((defect) => {
      const column =
        defect === 'bad-barpair'
          ? barPairColumn
          : defect === 'bad-old-equipment'
            ? oldEquipmentColumn
            : null;
      return column === null ? [] : [{ job, column, defect }];
    }),
  );

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
      // Derive, flush, snapshot, then write blob and verifier in ONE
      // transaction. The order matters more than any single step and it lives
      // in src/data/changePassphrase.ts, where it has its own regression tests.
      await runChangePassphrase(newPass, () => getState().vault);

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
      // Same path the lock screen uses: decrypt, migrate, then write the vault
      // and a fresh verifier together. Afterwards the backup's passphrase is
      // the one that unlocks this device.
      const restored = await restoreFromBackupText(restoreText, restorePass);
      commit(() => restored);

      setRestoreText(null);
      setRestorePass('');
      setMessage(
        `Restored ${restored.packs.length} pack(s). This device now unlocks with the ` +
          `passphrase that encrypted that backup.`,
      );
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

      {corrections.length > 0 && (
        <section class="section">
          <h2 class="section__title">Rows to check</h2>
          <p class="section__hint">
            {corrections.length === 1 ? 'One row' : `${corrections.length} rows`} arrived with a
            value the app could not read. A row with an unreadable bar pair sorts as Unplaced
            instead of into frame order; correcting it here puts it back in walk order.
          </p>

          {/*
            This lives in Settings, not on the card. The engineer asked not to
            have to click into jobs at all (D17), and correcting a couple of bad
            rows is not the job — it is a one-off repair, so it belongs off the
            main screen entirely rather than as furniture on every card.
          */}
          {corrections.map(({ job, column, defect }) => (
            <label class="field" key={`${job.id}:${defect}`}>
              <span class="field__label">
                Correct {column} for job {job.seq} ({job.jobNumber})
              </span>
              <input
                type="text"
                inputMode="text"
                autocomplete="off"
                spellcheck={false}
                value={job.source[column] ?? ''}
                onInput={(event) =>
                  correctSourceValue(job.id, column, (event.target as HTMLInputElement).value)
                }
              />
            </label>
          ))}
        </section>
      )}

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

        {/* Flush first, exactly like the header lock button. Locking with a
            change still in the debounce window would drop it: the write lands
            after the key is gone and fails. */}
        <button
          type="button"
          class="button"
          onClick={() => {
            void flushSave()
              .catch(() => undefined)
              .finally(() => lock());
          }}
        >
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
          PairTrack {APP_VERSION} ({BUILD_COMMIT}). No account, no server, no network. Your job data is encrypted
          on this phone and never leaves it unless you export it.
        </p>
      </section>
    </div>
  );
}
