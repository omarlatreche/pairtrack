/**
 * Encrypted backup and restore — BRIEF §9.5.
 *
 * A `.ptbak` is the whole vault, sealed with his passphrase. Because it is
 * ciphertext, it is safe to email, AirDrop or leave in iCloud — and the UI says
 * so, because that is what makes backups actually happen.
 *
 * Restore requires the passphrase that encrypted the file, which may not be the
 * current one: an old backup keeps its own salt and KDF parameters.
 */
import { decryptJson, encryptJson, sealedFromJson, sealedToJson } from '../crypto/cipher';
import { deriveKeyInWorker } from '../crypto/kdf';
import { CURRENT_KDF_PARAMS, type KdfParams } from '../crypto/params';
import { generateSalt } from '../crypto/kdf';
import { toBase64, fromBase64 } from '../crypto/bytes';
import type { Vault } from '../data/types';

export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'ptbak';

export interface BackupFile {
  readonly format: 'pairtrack-backup';
  readonly version: number;
  readonly createdAt: string;
  readonly kdf: KdfParams;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

/**
 * Seal the vault under a fresh salt derived from the given passphrase.
 *
 * A new salt per backup, rather than reusing the device's: the backup is a
 * separate artefact that may outlive the device, and it costs one derivation.
 */
export async function createBackup(vault: Vault, passphrase: string): Promise<Blob> {
  const salt = generateSalt();
  const key = await deriveKeyInWorker(passphrase, salt, CURRENT_KDF_PARAMS);
  const sealed = await encryptJson(key, vault);
  const asJson = sealedToJson(sealed);

  const file: BackupFile = {
    format: 'pairtrack-backup',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: CURRENT_KDF_PARAMS,
    salt: toBase64(salt),
    iv: asJson.iv,
    ciphertext: asJson.ciphertext,
  };

  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not a PairTrack backup.');
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new BackupError('That file is not a PairTrack backup.');
  }

  const file = parsed as Partial<BackupFile>;
  if (file.format !== 'pairtrack-backup') {
    throw new BackupError('That file is not a PairTrack backup.');
  }
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new BackupError(
      'That backup was made by a newer version of PairTrack. Update the app first.',
    );
  }
  if (
    typeof file.salt !== 'string' ||
    typeof file.iv !== 'string' ||
    typeof file.ciphertext !== 'string' ||
    file.kdf === undefined
  ) {
    throw new BackupError('That backup file is incomplete or damaged.');
  }

  return file as BackupFile;
}

/** Open a backup. Throws BackupError on a wrong passphrase or damaged file. */
export async function restoreBackup(file: BackupFile, passphrase: string): Promise<Vault> {
  const key = await deriveKeyInWorker(passphrase, fromBase64(file.salt), file.kdf);

  try {
    return await decryptJson<Vault>(key, sealedFromJson({ iv: file.iv, ciphertext: file.ciphertext }));
  } catch {
    // Indistinguishable by design: a wrong key and a tampered file both fail
    // GCM's auth tag. Say the likely thing.
    throw new BackupError('Incorrect passphrase for that backup, or the file is damaged.');
  }
}

export function backupFileName(packName: string | null): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const base = (packName ?? 'pairtrack').replace(/[^\w\-. ]+/g, '').trim() || 'pairtrack';
  return `${base} - ${stamp}.${BACKUP_EXTENSION}`;
}
