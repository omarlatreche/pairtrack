/// <reference lib="webworker" />
/**
 * PBKDF2 worker.
 *
 * 600,000 iterations blocks its thread for roughly half a second. Doing it here
 * keeps the unlock screen responsive (BRIEF §9.2).
 *
 * The derived CryptoKey is non-extractable and structured-cloneable, so posting
 * it back to the main thread never exposes key material to JS.
 */
import { deriveKey } from '../crypto/kdf';
import type { KdfRequest, KdfResponse } from '../crypto/kdf';

self.addEventListener('message', (event: MessageEvent<KdfRequest>) => {
  const { id, passphrase, salt, params } = event.data;

  deriveKey(passphrase, salt, params)
    .then((key) => {
      const response: KdfResponse = { id, key };
      (self as unknown as Worker).postMessage(response);
    })
    .catch((error: unknown) => {
      const response: KdfResponse = {
        id,
        error: error instanceof Error ? error.message : 'Key derivation failed',
      };
      (self as unknown as Worker).postMessage(response);
    });
});
