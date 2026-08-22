/**
 * Key derivation — BRIEF §9.2.
 *
 * Turns a passphrase into a non-extractable AES-GCM key. The passphrase is
 * never stored; the salt is stored in the clear (a salt is not a secret).
 *
 * The 600,000 PBKDF2 iterations take roughly half a second on a mid-range
 * phone, which is the point. deriveKeyInWorker() runs it off the main thread so
 * the unlock screen stays responsive; deriveKey() is the direct version used by
 * the worker itself and by tests.
 */
import {
  CIPHER_KEY_BITS,
  CIPHER_NAME,
  CURRENT_KDF_PARAMS,
  KDF_NAME,
  SALT_BYTES,
  type KdfParams,
} from './params';
import { randomBytes, toBuffer, utf8Encode, wipe } from './bytes';

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/**
 * Derive the AES-GCM key.
 *
 * `extractable: false` means the key material cannot be read back out of the
 * CryptoKey by any code, including ours. That is what stops a bug — or an XSS
 * that the CSP somehow missed — from exfiltrating it.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = CURRENT_KDF_PARAMS,
): Promise<CryptoKey> {
  const passphraseBytes = utf8Encode(passphrase);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    toBuffer(passphraseBytes),
    KDF_NAME,
    false,
    ['deriveKey'],
  );

  // The imported base key is itself non-extractable, but the byte copy we made
  // is ours to clear.
  wipe(passphraseBytes);

  return crypto.subtle.deriveKey(
    {
      name: params.name,
      salt: toBuffer(salt),
      iterations: params.iterations,
      hash: params.hash,
    },
    baseKey,
    { name: CIPHER_NAME, length: CIPHER_KEY_BITS },
    false, // extractable: false — BRIEF §9.2
    ['encrypt', 'decrypt'],
  );
}

/** Message shapes for the KDF worker. */
export interface KdfRequest {
  readonly id: number;
  readonly passphrase: string;
  readonly salt: Uint8Array;
  readonly params: KdfParams;
}

export interface KdfResponse {
  readonly id: number;
  readonly key?: CryptoKey;
  readonly error?: string;
}

let worker: Worker | null = null;
let nextRequestId = 1;

function getWorker(): Worker {
  if (worker === null) {
    worker = new Worker(new URL('../workers/kdf.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pairtrack-kdf',
    });
  }
  return worker;
}

/**
 * Derive off the main thread. A non-extractable CryptoKey is structured-
 * cloneable, so the worker can hand the finished key back without the key
 * material ever being visible to JS on either side.
 *
 * Falls back to deriving inline where Worker is unavailable (tests, and any
 * browser that refuses a module worker) — same result, briefly janky UI.
 */
export async function deriveKeyInWorker(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = CURRENT_KDF_PARAMS,
): Promise<CryptoKey> {
  if (typeof Worker === 'undefined') {
    return deriveKey(passphrase, salt, params);
  }

  let w: Worker;
  try {
    w = getWorker();
  } catch {
    return deriveKey(passphrase, salt, params);
  }

  const id = nextRequestId++;

  return new Promise<CryptoKey>((resolve, reject) => {
    const onMessage = (event: MessageEvent<KdfResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.key) resolve(event.data.key);
      else reject(new Error(event.data.error ?? 'Key derivation failed'));
    };

    const onError = (event: ErrorEvent) => {
      cleanup();
      // A broken worker should not permanently break unlocking.
      worker?.terminate();
      worker = null;
      deriveKey(passphrase, salt, params).then(resolve, () =>
        reject(new Error(event.message || 'Key derivation failed')),
      );
    };

    function cleanup() {
      w.removeEventListener('message', onMessage as EventListener);
      w.removeEventListener('error', onError as EventListener);
    }

    w.addEventListener('message', onMessage as EventListener);
    w.addEventListener('error', onError as EventListener);

    const request: KdfRequest = { id, passphrase, salt, params };
    w.postMessage(request);
  });
}

/** Drop the worker on lock so nothing of the last derivation lingers. */
export function disposeKdfWorker(): void {
  worker?.terminate();
  worker = null;
}
