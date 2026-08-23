/**
 * Restoring from a `.ptbak` — BRIEF §9.5.
 *
 * Shared by two screens, and the second one is the important one.
 *
 * Settings can restore because the vault is already open. But the case that
 * actually matters is the one where it is *not*: the verifier accepts the
 * passphrase and the store still will not decrypt. The lock screen tells him to
 * restore a backup, and until this existed that advice pointed at a control he
 * could only reach by first succeeding at the thing that was failing.
 *
 * So restore does not assume an open vault. It derives a fresh key from the
 * passphrase that encrypted the backup and writes the vault and its new
 * verifier together, re-establishing the installation from the backup alone.
 */
import { deriveNewVault } from '../crypto/vault';
import { parseBackup, restoreBackup } from '../export/backup';
import { migrate, rekeyVault } from './repository';
import type { Vault } from './types';

/**
 * Open a backup and make it this device's vault.
 *
 * `passphrase` is the one that encrypted the BACKUP, which need not be the one
 * in use here — an old backup keeps its own salt and KDF parameters. After this
 * succeeds, that passphrase is the one that unlocks the app.
 *
 * @returns the restored vault, migrated and already persisted.
 */
export async function restoreFromBackupText(text: string, passphrase: string): Promise<Vault> {
  const file = parseBackup(text);

  // Throws BackupError on a wrong passphrase or a damaged file — before
  // anything on this device is touched.
  const restored = migrate(await restoreBackup(file, passphrase));

  // A fresh salt and verifier for this device.
  //
  // Derive WITHOUT adopting. `rekeyVault` writes the blob and the meta in one
  // transaction and only then adopts the key, inside the same critical section.
  // So if the write fails, the session key is untouched: a vault that was open
  // stays open under its old key, and one that was locked stays locked. This
  // used to call createVault, which adopted the key first — and a failed write
  // then left the live key with no verifier on disk, which is the one failure
  // that locks him out of his own week's work with no reset (D13).
  const { meta, key } = await deriveNewVault(passphrase);
  await rekeyVault(restored, key, meta);

  return restored;
}
