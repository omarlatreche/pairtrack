/**
 * Byte / base64 / UTF-8 helpers.
 *
 * Kept separate from the crypto so they can be unit-tested without WebCrypto,
 * and so cipher.ts reads as cryptography rather than as string handling.
 */

/**
 * getRandomValues refuses more than 65,536 bytes in one call, in browsers and
 * in Node alike, so fill in chunks. Today's callers only ask for 12 or 32
 * bytes, but a future one should not have to know about the limit.
 */
const RANDOM_CHUNK = 65_536;

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += RANDOM_CHUNK) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + RANDOM_CHUNK, length)));
  }
  return out;
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * base64, not base64url — these strings go into JSON files (.ptbak) and
 * IndexedDB, never into a URL.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // avoid blowing the argument limit on large blobs
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Constant-time-ish equality. Not defending against a timing attack here — an
 * attacker with the device has better options — but there is no reason to leak.
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

/**
 * Best-effort overwrite of a buffer that held plaintext. JS gives no real
 * guarantee (the GC may have copied it), but zeroing what we can hold is
 * strictly better than leaving it for a heap dump.
 */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

/** ArrayBuffer view that WebCrypto accepts without a type quarrel. */
export function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
