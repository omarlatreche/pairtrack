/**
 * Cryptographic parameters, in one place, each with the reason it was chosen.
 *
 * BRIEF §9.2 / §9.3. Nothing in this file may import from src/ui.
 *
 * If you change a value here you must also bump KDF_VERSION and add a migration
 * path in kdf.ts, or every existing device becomes unopenable.
 */

/**
 * PBKDF2-HMAC-SHA-256.
 *
 * Why PBKDF2 and not Argon2/scrypt: WebCrypto ships PBKDF2 in every browser
 * with no dependency. BRIEF §6 forbids crypto libraries, and a hand-rolled
 * Argon2 would be far worse than a well-parameterised PBKDF2.
 */
export const KDF_NAME = 'PBKDF2' as const;

/** SHA-256 — the hash OWASP's 600k figure is specified against. */
export const KDF_HASH = 'SHA-256' as const;

/**
 * 600,000 iterations — current OWASP guidance for PBKDF2-HMAC-SHA-256.
 * Deliberately slow: ~0.5-1s on a mid-range phone. It runs in a Web Worker so
 * the UI does not jank, and it happens once per unlock, not per save.
 */
export const KDF_ITERATIONS = 600_000;

/**
 * 32 bytes of salt from crypto.getRandomValues.
 * A salt is not a secret — it is stored in the clear in IndexedDB. Its job is
 * to make precomputed rainbow tables useless, and 32 bytes is comfortably past
 * the point where collisions matter.
 */
export const SALT_BYTES = 32;

/** AES-GCM, 256-bit. Authenticated encryption: tampering fails, it does not decrypt to garbage. */
export const CIPHER_NAME = 'AES-GCM' as const;
export const CIPHER_KEY_BITS = 256;

/**
 * 12-byte (96-bit) IV — the size AES-GCM is specified for; longer IVs get
 * hashed down and buy nothing. A FRESH random IV for every single encryption.
 * Reusing an IV with the same key is catastrophic for GCM (it leaks the
 * keystream and the auth key), which is why cipher.ts generates one per call
 * and never accepts one from a caller.
 */
export const IV_BYTES = 12;

/**
 * Known plaintext encrypted with the derived key at setup. Decrypting it is how
 * we tell "wrong passphrase" from "corrupt store" — BRIEF §9.4. AES-GCM's auth
 * tag does the actual work; this just gives us something safe to test against.
 */
export const VERIFIER_PLAINTEXT = 'pairtrack-verifier-v1';

/** Bumped if any parameter above changes, so old vaults can be migrated. */
export const KDF_VERSION = 1;

/** How many encrypted snapshots to keep as a rollback ring (BRIEF §9.3). */
export const SNAPSHOT_RING_SIZE = 5;

export interface KdfParams {
  readonly version: number;
  readonly name: typeof KDF_NAME;
  readonly hash: typeof KDF_HASH;
  readonly iterations: number;
}

export const CURRENT_KDF_PARAMS: KdfParams = {
  version: KDF_VERSION,
  name: KDF_NAME,
  hash: KDF_HASH,
  iterations: KDF_ITERATIONS,
};
