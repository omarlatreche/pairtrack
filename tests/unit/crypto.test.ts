import { describe, expect, it, beforeEach } from 'vitest';
import { deriveKey, generateSalt } from '../../src/crypto/kdf';
import {
  DecryptionError,
  checkVerifier,
  createVerifier,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  sealedFromJson,
  sealedToJson,
} from '../../src/crypto/cipher';
import {
  bytesEqual,
  fromBase64,
  randomBytes,
  toBase64,
  utf8Decode,
  utf8Encode,
} from '../../src/crypto/bytes';
import { IV_BYTES, KDF_ITERATIONS, SALT_BYTES } from '../../src/crypto/params';
import {
  ThrottledError,
  WrongPassphraseError,
  __resetThrottleForTests,
  createVault,
  isUnlocked,
  lock,
  requireKey,
  unlock,
} from '../../src/crypto/vault';
import { assessPassphrase, isPassphraseAcceptable } from '../../src/crypto/passphrase';
import { clampMinutes } from '../../src/crypto/autolock';

// PBKDF2 at 600k iterations is deliberately slow. Use a reduced count where the
// test is about the surrounding logic rather than the parameter itself.
const FAST_KDF = { version: 1, name: 'PBKDF2', hash: 'SHA-256', iterations: 1000 } as const;

async function fastKey(passphrase = 'correct horse battery staple'): Promise<CryptoKey> {
  return deriveKey(passphrase, generateSalt(), FAST_KDF);
}

describe('byte helpers', () => {
  it('round-trips base64', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    expect(bytesEqual(fromBase64(toBase64(bytes)), bytes)).toBe(true);
  });

  it('round-trips base64 for a blob larger than the chunk size', () => {
    const bytes = randomBytes(200_000);
    expect(bytesEqual(fromBase64(toBase64(bytes)), bytes)).toBe(true);
  });

  it('round-trips utf-8 including non-ASCII', () => {
    const text = 'Exchange — CODE 100000 · £ frame ✓';
    expect(utf8Decode(utf8Encode(text))).toBe(text);
  });
});

describe('key derivation', () => {
  it('produces a 32-byte salt', () => {
    expect(generateSalt().length).toBe(SALT_BYTES);
  });

  it('produces different salts each time', () => {
    expect(bytesEqual(generateSalt(), generateSalt())).toBe(false);
  });

  it('uses 600,000 iterations by default (OWASP guidance)', () => {
    expect(KDF_ITERATIONS).toBe(600_000);
  });

  it('derives a non-extractable AES-GCM key', async () => {
    const key = await fastKey();
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
  });

  it('refuses to export the derived key', async () => {
    const key = await fastKey();
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('is deterministic for the same passphrase and salt', async () => {
    const salt = generateSalt();
    const a = await deriveKey('same passphrase here', salt, FAST_KDF);
    const b = await deriveKey('same passphrase here', salt, FAST_KDF);

    // Keys are non-extractable, so compare behaviourally: b must open a's output.
    const sealed = await encryptBytes(a, utf8Encode('hello frame'));
    expect(utf8Decode(await decryptBytes(b, sealed))).toBe('hello frame');
  });

  it('produces a different key for a different salt', async () => {
    const a = await deriveKey('same passphrase here', generateSalt(), FAST_KDF);
    const b = await deriveKey('same passphrase here', generateSalt(), FAST_KDF);
    const sealed = await encryptBytes(a, utf8Encode('hello'));
    await expect(decryptBytes(b, sealed)).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('AES-GCM cipher', () => {
  it('round-trips bytes', async () => {
    const key = await fastKey();
    const plaintext = utf8Encode('442 jobs, one shelf');
    const sealed = await encryptBytes(key, plaintext);
    expect(bytesEqual(await decryptBytes(key, sealed), plaintext)).toBe(true);
  });

  it('round-trips JSON', async () => {
    const key = await fastKey();
    const value = { jobs: 442, blocks: ['A', 'B', 'INTL'], nested: { ok: true } };
    const sealed = await encryptJson(key, value);
    expect(await decryptJson(key, sealed)).toEqual(value);
  });

  it('uses a 12-byte IV', async () => {
    const key = await fastKey();
    const sealed = await encryptBytes(key, utf8Encode('x'));
    expect(sealed.iv.length).toBe(IV_BYTES);
  });

  it('never reuses an IV across many encryptions with the same key', async () => {
    const key = await fastKey();
    const seen = new Set<string>();
    const runs = 2000;

    for (let i = 0; i < runs; i += 1) {
      const sealed = await encryptBytes(key, utf8Encode(`job ${i}`));
      seen.add(toBase64(sealed.iv));
    }

    // IV reuse under one key breaks GCM completely — this is the assertion
    // BRIEF §9.3 asks for.
    expect(seen.size).toBe(runs);
  });

  it('produces different ciphertext for identical plaintext', async () => {
    const key = await fastKey();
    const a = await encryptBytes(key, utf8Encode('identical'));
    const b = await encryptBytes(key, utf8Encode('identical'));
    expect(bytesEqual(a.ciphertext, b.ciphertext)).toBe(false);
  });

  it('fails cleanly with the wrong key', async () => {
    const good = await fastKey('the right passphrase!!');
    const bad = await fastKey('the wrong passphrase!!');
    const sealed = await encryptBytes(good, utf8Encode('secret'));
    await expect(decryptBytes(bad, sealed)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects tampered ciphertext (GCM auth tag)', async () => {
    const key = await fastKey();
    const sealed = await encryptBytes(key, utf8Encode('untampered'));
    const tampered = { ...sealed, ciphertext: Uint8Array.from(sealed.ciphertext) };
    tampered.ciphertext.set([(tampered.ciphertext[0] as number) ^ 0xff], 0);
    await expect(decryptBytes(key, tampered)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects a tampered IV', async () => {
    const key = await fastKey();
    const sealed = await encryptBytes(key, utf8Encode('untampered'));
    const tampered = { ...sealed, iv: Uint8Array.from(sealed.iv) };
    tampered.iv.set([(tampered.iv[0] as number) ^ 0xff], 0);
    await expect(decryptBytes(key, tampered)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('serialises to JSON and back without loss', async () => {
    const key = await fastKey();
    const sealed = await encryptJson(key, { pack: 'test', n: 442 });
    const revived = sealedFromJson(JSON.parse(JSON.stringify(sealedToJson(sealed))));
    expect(await decryptJson(key, revived)).toEqual({ pack: 'test', n: 442 });
  });
});

describe('verifier blob', () => {
  it('accepts the key that created it', async () => {
    const key = await fastKey();
    expect(await checkVerifier(key, await createVerifier(key))).toBe(true);
  });

  it('rejects a different key without throwing', async () => {
    const good = await fastKey('passphrase number one');
    const bad = await fastKey('passphrase number two');
    expect(await checkVerifier(bad, await createVerifier(good))).toBe(false);
  });
});

describe('vault lock lifecycle', () => {
  beforeEach(() => {
    lock();
    __resetThrottleForTests();
  });

  it('starts locked and refuses to hand out a key', () => {
    expect(isUnlocked()).toBe(false);
    expect(() => requireKey()).toThrow(/locked/i);
  });

  it('creating a vault leaves it unlocked', async () => {
    await createVault('a good long passphrase');
    expect(isUnlocked()).toBe(true);
    expect(() => requireKey()).not.toThrow();
  });

  it('unlocks with the right passphrase and refuses the wrong one', async () => {
    const meta = await createVault('a good long passphrase');
    lock();
    expect(isUnlocked()).toBe(false);

    await expect(unlock('not the passphrase', meta)).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(isUnlocked()).toBe(false);

    await unlock('a good long passphrase', meta);
    expect(isUnlocked()).toBe(true);
  }, 30_000);

  it('drops the key on lock', async () => {
    await createVault('a good long passphrase');
    const key = requireKey();
    const sealed = await encryptBytes(key, utf8Encode('still here'));
    lock();
    expect(isUnlocked()).toBe(false);
    expect(() => requireKey()).toThrow();
    // The sealed blob is still on disk but nothing can open it now.
    expect(sealed.ciphertext.length).toBeGreaterThan(0);
  }, 30_000);

  it('throttles after five failed attempts', async () => {
    const meta = await createVault('a good long passphrase');
    lock();

    for (let i = 0; i < 5; i += 1) {
      await expect(unlock('wrong wrong wrong', meta)).rejects.toBeInstanceOf(WrongPassphraseError);
    }

    // The sixth failure arms the lockout...
    await expect(unlock('wrong wrong wrong', meta)).rejects.toBeInstanceOf(WrongPassphraseError);
    // ...and the seventh is refused before the KDF even runs.
    await expect(unlock('a good long passphrase', meta)).rejects.toBeInstanceOf(ThrottledError);
  }, 60_000);
});

describe('passphrase policy', () => {
  it('requires at least 12 characters', () => {
    expect(isPassphraseAcceptable('short')).toBe(false);
    expect(isPassphraseAcceptable('123456789012')).toBe(true);
    expect(assessPassphrase('short').label).toBe('too short');
    expect(assessPassphrase('short').score).toBe(0);
  });

  it('scores a long multi-word phrase highly', () => {
    expect(assessPassphrase('purple frame ladder Tuesday 41').score).toBeGreaterThanOrEqual(3);
  });

  it('penalises common words', () => {
    const weak = assessPassphrase('passwordpassword');
    expect(weak.score).toBeLessThanOrEqual(2);
    expect(weak.hint).toMatch(/common/i);
  });

  it('penalises keyboard runs', () => {
    expect(assessPassphrase('qwertyuiop12345').score).toBeLessThanOrEqual(3);
  });

  it('penalises repeated chunks', () => {
    expect(assessPassphrase('abcabcabcabcabc').score).toBeLessThanOrEqual(2);
  });

  it('never scores an acceptable passphrase at 0', () => {
    expect(assessPassphrase('aaaaaaaaaaaaaa').score).toBeGreaterThan(0);
  });
});

describe('auto-lock timeout clamping', () => {
  it('clamps to the 1-60 minute range', () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(-5)).toBe(1);
    expect(clampMinutes(15)).toBe(15);
    expect(clampMinutes(999)).toBe(60);
    expect(clampMinutes(Number.NaN)).toBe(15);
  });
});
