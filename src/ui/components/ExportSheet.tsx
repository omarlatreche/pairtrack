/**
 * Export sheet — BRIEF §7.9, §9.5.
 *
 * The warning on the plaintext options is not decoration. An exported xlsx or
 * CSV is 442 customer telephone numbers in the clear; a `.ptbak` is ciphertext
 * and safe to email. The encrypted backup is therefore listed first and styled
 * as the primary action.
 */
import { useState } from 'preact/hooks';
import { buildCsv, buildXlsx, deliverFile, exportFileName } from '../../export/exportPack';
import { backupFileName, createBackup } from '../../export/backup';
import type { Pack } from '../../data/types';
import { flush, getState, updateSettings } from '../../state/store';
import { Sheet } from './Sheet';
import { ExportIcon, LockIcon, WarnIcon } from './Icons';

interface ExportSheetProps {
  readonly pack: Pack;
  readonly onClose: () => void;
}

export function ExportSheet({ pack, onClose }: ExportSheetProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmPlaintext, setConfirmPlaintext] = useState<'xlsx' | 'csv' | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseAgain, setPassphraseAgain] = useState('');
  const [backupPrompt, setBackupPrompt] = useState(false);

  const failReasons = getState().vault?.settings.failReasons ?? [];

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setDone(null);
    try {
      // Never export a state that is still sitting in the debounce window.
      await flush();
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  }

  async function exportPlaintext(kind: 'xlsx' | 'csv') {
    await run(kind === 'xlsx' ? 'Building spreadsheet' : 'Building CSV', async () => {
      const blob =
        kind === 'xlsx'
          ? await buildXlsx(pack, pack.jobs, failReasons)
          : buildCsv(pack, pack.jobs, failReasons);
      const name = exportFileName(pack, kind);
      const how = await deliverFile(blob, name);
      setDone(how === 'shared' ? `Shared ${name}` : `Saved ${name}`);
      setConfirmPlaintext(null);
    });
  }

  async function exportBackup() {
    const vault = getState().vault;
    if (vault === null) return;
    if (passphrase.length === 0) {
      setError('Enter the passphrase to encrypt the backup with.');
      return;
    }
    // A typo here produces a file that NOTHING can ever open — not him, not
    // anyone — and he would not find out until the day he needed it. The
    // backup is the only recovery route there is, so it gets the same
    // type-it-twice treatment as setting the passphrase in the first place.
    if (passphrase !== passphraseAgain) {
      setError('The two passphrases do not match.');
      return;
    }

    await run('Encrypting backup', async () => {
      const blob = await createBackup(vault, passphrase);
      const name = backupFileName(pack.name);
      const how = await deliverFile(blob, name);
      updateSettings((current) => ({
        ...current,
        changesSinceBackup: 0,
        lastBackupAt: new Date().toISOString(),
      }));
      setPassphrase('');
      setPassphraseAgain('');
      setBackupPrompt(false);
      setDone(how === 'shared' ? `Shared ${name}` : `Saved ${name}`);
    });
  }

  return (
    <Sheet title="Export" onClose={onClose}>
      {error !== null && (
        <div class="callout callout--danger">
          <strong>Could not export</strong>
          <p>{error}</p>
        </div>
      )}

      {done !== null && (
        <div class="callout callout--info">
          <p>{done}</p>
        </div>
      )}

      {busy !== null && (
        <div class="callout">
          <p>{busy}…</p>
        </div>
      )}

      {confirmPlaintext === null && !backupPrompt && (
        <>
          <button
            type="button"
            class="sheet__option"
            disabled={busy !== null}
            onClick={() => setBackupPrompt(true)}
          >
            <LockIcon size={20} />
            <span>
              Encrypted backup (.ptbak)
              <br />
              <small style={{ fontWeight: 400, opacity: 0.75 }}>
                Safe to email, AirDrop or keep in iCloud
              </small>
            </span>
          </button>

          <h3 class="section__title">For the office</h3>

          <button
            type="button"
            class="sheet__option"
            disabled={busy !== null}
            onClick={() => setConfirmPlaintext('xlsx')}
          >
            <ExportIcon size={20} />
            <span>
              Spreadsheet (.xlsx)
              <br />
              <small style={{ fontWeight: 400, opacity: 0.75 }}>
                Same columns as the pack, progress added
              </small>
            </span>
          </button>

          <button
            type="button"
            class="sheet__option"
            disabled={busy !== null}
            onClick={() => setConfirmPlaintext('csv')}
          >
            <ExportIcon size={20} />
            <span>CSV (.csv)</span>
          </button>
        </>
      )}

      {backupPrompt && (
        <>
          <div class="callout callout--info">
            <strong>This file is encrypted</strong>
            <p>
              It can only be opened with the passphrase you type below. That makes it safe to
              email or keep in cloud storage.
            </p>
          </div>

          <label class="field">
            <span class="field__label">Passphrase to encrypt with</span>
            <input
              type="password"
              class="input"
              autocomplete="current-password"
              value={passphrase}
              onInput={(event) => setPassphrase((event.target as HTMLInputElement).value)}
            />
            <p class="field__hint">
              Use your normal passphrase unless you have a reason not to — you will need this
              exact text to restore.
            </p>
          </label>

          <label class="field">
            <span class="field__label">Type it again</span>
            <input
              type="password"
              class="input"
              autocomplete="current-password"
              value={passphraseAgain}
              onInput={(event) => setPassphraseAgain((event.target as HTMLInputElement).value)}
            />
            {passphraseAgain !== '' && passphrase !== passphraseAgain && (
              <p class="field__hint" style={{ color: 'var(--fail)' }}>
                These do not match.
              </p>
            )}
          </label>

          <button
            type="button"
            class="button button--primary"
            disabled={busy !== null || passphrase === '' || passphrase !== passphraseAgain}
            onClick={() => void exportBackup()}
          >
            Create encrypted backup
          </button>
          <button
            type="button"
            class="button"
            onClick={() => {
              setPassphrase('');
              setPassphraseAgain('');
              setBackupPrompt(false);
            }}
          >
            Back
          </button>
        </>
      )}

      {confirmPlaintext !== null && (
        <>
          <div class="callout callout--danger">
            <strong>
              <WarnIcon size={16} /> This file is not encrypted
            </strong>
            <p>
              It contains <strong>{pack.jobs.length} customer telephone numbers</strong> in plain
              text, along with every job reference and frame position.
            </p>
            <p>
              Send it only to the office, by whatever route your contract allows. Delete it from
              the phone afterwards.
            </p>
          </div>

          <button
            type="button"
            class="button button--danger"
            disabled={busy !== null}
            onClick={() => void exportPlaintext(confirmPlaintext)}
          >
            I understand — export {confirmPlaintext.toUpperCase()}
          </button>
          <button type="button" class="button" onClick={() => setConfirmPlaintext(null)}>
            Cancel
          </button>
        </>
      )}
    </Sheet>
  );
}
