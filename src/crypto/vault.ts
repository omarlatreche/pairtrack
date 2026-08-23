/**
 * The vault: key lifetime, lock state, unlock throttling — BRIEF §9.4.
 *
 * The CryptoKey lives in `sessionKey`, a module-scoped variable, and nowhere
 * else. It is never written to localStorage, sessionStorage, IndexedDB, a
 * cookie or the URL. Locking drops the reference; the key is then unrecoverable
 * without the passphrase.
 *
 * No UI imports here — this module is testable on its own.
 */
import { deriveKeyInWorker, disposeKdfWorker, generateSalt } from './kdf';
import { checkVerifier, createVerifier, type Sealed } from './cipher';
import { CURRENT_KDF_PARAMS, type KdfParams } from './params';

/** What the store persists in the clear so a passphrase can be checked. */
export interface VaultMeta {
  readonly kdf: KdfParams;
  readonly salt: Uint8Array;
  readonly verifier: Sealed;
  readonly createdAt: string;
}

export type LockState = 'uninitialised' | 'locked' | 'unlocked';

/**
 * The only place the derived key exists. Module scope, not exported, never
 * serialised.
 */
let sessionKey: CryptoKey | null = null;
let unlockedAt: number | null = null;

type Listener = (state: LockState) => void;
const listeners = new Set<Listener>();

function emit(state: LockState): void {
  for (const listener of listeners) listener(state);
}

export function onLockStateChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUnlocked(): boolean {
  return sessionKey !== null;
}

export function unlockedSince(): number | null {
  return unlockedAt;
}

/**
 * The key, for the storage layer only. Throws rather than returning null so a
 * caller can never accidentally write plaintext because the vault was locked.
 */
export function requireKey(): CryptoKey {
  if (sessionKey === null) {
    throw new Error('Vault is locked');
  }
  return sessionKey;
}

/**
 * Derive a fresh salt, key and verifier for a brand-new vault WITHOUT touching
 * the session key.
 *
 * Split out from `createVault` because restore needs the derivation without the
 * adoption. Restoring used to call `createVault`, which installed the new key
 * immediately, and only then attempted the write. If that write failed, the old
 * vault and old verifier were still on disk while the live key was the new one:
 * the next ordinary save would seal the blob under a key whose verifier had
 * never been persisted, and then the old passphrase would pass the verifier and
 * decrypt nothing while the new one failed the verifier outright. Neither
 * passphrase opens it — the exact failure D13 exists to prevent, reached
 * through the recovery path, which is the worst possible place for it.
 *
 * Callers that must not lose the current key on failure derive here and let
 * `rekeyVault` adopt inside its critical section, once the write has landed.
 */
export async function deriveNewVault(
  passphrase: string,
): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const salt = generateSalt();
  const key = await deriveKeyInWorker(passphrase, salt, CURRENT_KDF_PARAMS);
  const verifier = await createVerifier(key);

  return {
    key,
    meta: {
      kdf: CURRENT_KDF_PARAMS,
      salt,
      verifier,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Create a brand-new vault and adopt its key. Returns the meta to persist.
 *
 * Adopting up front is correct HERE and only here: first run has no existing
 * vault, so a failed write leaves nothing to be locked out of.
 */
export async function createVault(passphrase: string): Promise<VaultMeta> {
  const { meta, key } = await deriveNewVault(passphrase);

  sessionKey = key;
  unlockedAt = Date.now();
  emit('unlocked');

  return meta;
}

// --- Unlock throttling (BRIEF §9.4) -----------------------------------------
//
// Escalating delay after 5 failures. Deliberately NOT a wipe: losing a day's
// work to a fat-fingered unlock in the rain is a bigger real risk than the
// marginal gain against someone who already has the phone.

const FREE_ATTEMPTS = 5;
const MAX_DELAY_MS = 60_000;

let failedAttempts = 0;
let lockoutUntil = 0;

export function failedAttemptCount(): number {
  return failedAttempts;
}

/** Milliseconds still to wait, or 0 if an attempt is allowed now. */
export function throttleRemainingMs(): number {
  return Math.max(0, lockoutUntil - Date.now());
}

function registerFailure(): void {
  failedAttempts += 1;
  if (failedAttempts > FREE_ATTEMPTS) {
    const over = failedAttempts - FREE_ATTEMPTS;
    const delay = Math.min(MAX_DELAY_MS, 1000 * 2 ** (over - 1));
    lockoutUntil = Date.now() + delay;
  }
}

function clearFailures(): void {
  failedAttempts = 0;
  lockoutUntil = 0;
}

export class ThrottledError extends Error {
  constructor(public readonly remainingMs: number) {
    super(`Too many attempts. Wait ${Math.ceil(remainingMs / 1000)}s.`);
    this.name = 'ThrottledError';
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Incorrect passphrase');
    this.name = 'WrongPassphraseError';
  }
}

/**
 * Try to unlock. Resolves on success; throws WrongPassphraseError or
 * ThrottledError otherwise. Never leaves a half-unlocked state.
 */
export async function unlock(passphrase: string, meta: VaultMeta): Promise<void> {
  const remaining = throttleRemainingMs();
  if (remaining > 0) throw new ThrottledError(remaining);

  const key = await deriveKeyInWorker(passphrase, meta.salt, meta.kdf);
  const ok = await checkVerifier(key, meta.verifier);

  if (!ok) {
    registerFailure();
    throw new WrongPassphraseError();
  }

  clearFailures();
  sessionKey = key;
  unlockedAt = Date.now();
  emit('unlocked');
}

/**
 * Drop the key. Everything decrypted must be cleared by the caller's state
 * layer in response to the lock event — this module owns the key, not the data.
 */
export function lock(): void {
  sessionKey = null;
  unlockedAt = null;
  disposeKdfWorker();
  emit('locked');
}

/**
 * Change the passphrase: derive a new key, re-seal the verifier, swap the
 * session key. The caller must re-encrypt the store with the new key and
 * persist the returned meta in the same transaction.
 */
export async function rederiveForNewPassphrase(newPassphrase: string): Promise<{
  meta: VaultMeta;
  key: CryptoKey;
}> {
  if (sessionKey === null) throw new Error('Vault is locked');

  const salt = generateSalt();
  const key = await deriveKeyInWorker(newPassphrase, salt, CURRENT_KDF_PARAMS);
  const verifier = await createVerifier(key);

  return {
    key,
    meta: { kdf: CURRENT_KDF_PARAMS, salt, verifier, createdAt: new Date().toISOString() },
  };
}

/** Adopt a key produced by rederiveForNewPassphrase once the re-encrypt succeeded. */
export function adoptKey(key: CryptoKey): void {
  sessionKey = key;
  unlockedAt = Date.now();
  emit('unlocked');
}

/** Test seam only — resets throttling between test cases. */
export function __resetThrottleForTests(): void {
  clearFailures();
}
