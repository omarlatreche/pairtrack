/**
 * AES-GCM encrypt / decrypt — BRIEF §9.3.
 *
 * The whole job store is encrypted as one blob. A pack this size is well under 1MB, so
 * per-record encryption would buy nothing and would leak the record count.
 *
 * A fresh random 12-byte IV is generated *inside* this module for every
 * encryption. There is deliberately no way for a caller to supply one: IV reuse
 * under the same key is the one mistake that breaks GCM completely.
 */
import { CIPHER_NAME, IV_BYTES, VERIFIER_PLAINTEXT } from './params';
import { fromBase64, randomBytes, toBase64, toBuffer, utf8Decode, utf8Encode } from './bytes';

/** Ciphertext plus the IV it was produced with. The IV is not a secret. */
export interface Sealed {
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/** The JSON-safe form used in .ptbak files. */
export interface SealedJson {
  readonly iv: string;
  readonly ciphertext: string;
}

/** Thrown when decryption fails. Callers show "Incorrect passphrase". */
export class DecryptionError extends Error {
  constructor(message = 'Could not decrypt — wrong passphrase or damaged data') {
    super(message);
    this.name = 'DecryptionError';
  }
}

export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);

  const ciphertext = await crypto.subtle.encrypt(
    { name: CIPHER_NAME, iv: toBuffer(iv) },
    key,
    toBuffer(plaintext),
  );

  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptBytes(key: CryptoKey, sealed: Sealed): Promise<Uint8Array> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: CIPHER_NAME, iv: toBuffer(sealed.iv) },
      key,
      toBuffer(sealed.ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    // GCM's auth tag failed. Either the key is wrong or the bytes were
    // tampered with — indistinguishable, and that is the correct behaviour.
    throw new DecryptionError();
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  return encryptBytes(key, utf8Encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const bytes = await decryptBytes(key, sealed);
  try {
    return JSON.parse(utf8Decode(bytes)) as T;
  } catch {
    throw new DecryptionError('Decrypted successfully but the contents were not valid data');
  }
}

export function sealedToJson(sealed: Sealed): SealedJson {
  return { iv: toBase64(sealed.iv), ciphertext: toBase64(sealed.ciphertext) };
}

export function sealedFromJson(json: SealedJson): Sealed {
  return { iv: fromBase64(json.iv), ciphertext: fromBase64(json.ciphertext) };
}

/**
 * Verifier blob — BRIEF §9.4.
 *
 * A known constant sealed with the derived key at setup. On unlock we try to
 * open it: success means the passphrase is right, failure means it is wrong.
 * Without this a bad passphrase would surface as a corrupt-looking store.
 */
export async function createVerifier(key: CryptoKey): Promise<Sealed> {
  return encryptBytes(key, utf8Encode(VERIFIER_PLAINTEXT));
}

export async function checkVerifier(key: CryptoKey, verifier: Sealed): Promise<boolean> {
  try {
    const plaintext = await decryptBytes(key, verifier);
    return utf8Decode(plaintext) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}
