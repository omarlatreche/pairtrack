/**
 * Vitest setup.
 *
 * jsdom has no WebCrypto subtle and no IndexedDB, so both are supplied here.
 * Node's webcrypto is the same algorithms the browser uses — these tests
 * exercise real PBKDF2 and real AES-GCM, not a mock.
 */
import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

// The KDF worker is exercised directly in-process; deriveKeyInWorker falls back
// to inline derivation when Worker is undefined, which is the case in jsdom.
