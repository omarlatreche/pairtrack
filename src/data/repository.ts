/**
 * IndexedDB repository — BRIEF §9.3, phase 3.
 *
 * Everything job-related is stored as ONE encrypted blob (D3). What is stored
 * in the clear is exactly: the salt, the KDF parameters and the sealed verifier
 * blob. Nothing else. No job number, circuit number, bar pair, tie reference,
 * equipment reference or note is written in plaintext at any point.
 *
 * Writes are debounced and write-through: a state change is never left only in
 * memory (BRIEF §3.6). The last five encrypted snapshots are kept as a rollback
 * ring.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { decryptJson, encryptJson, type Sealed } from '../crypto/cipher';
import { requireKey } from '../crypto/vault';
import type { VaultMeta } from '../crypto/vault';
import { SNAPSHOT_RING_SIZE } from '../crypto/params';
import { DEFAULT_FAIL_REASONS } from './failReasons';
import { DEFAULT_VIEW, SCHEMA_VERSION, type Settings, type Vault } from './types';

const DB_NAME = 'pairtrack';
const DB_VERSION = 1;

/** Stored in the clear. A salt is not a secret, and the verifier is ciphertext. */
interface StoredMeta {
  readonly kdf: VaultMeta['kdf'];
  readonly salt: ArrayBuffer;
  readonly verifierIv: ArrayBuffer;
  readonly verifierCiphertext: ArrayBuffer;
  readonly createdAt: string;
}

interface StoredBlob {
  readonly iv: ArrayBuffer;
  readonly ciphertext: ArrayBuffer;
  readonly savedAt: string;
}

interface PairTrackDB extends DBSchema {
  meta: { key: string; value: StoredMeta };
  vault: { key: string; value: StoredBlob };
  snapshots: { key: number; value: StoredBlob };
}

const META_KEY = 'vault-meta';
const VAULT_KEY = 'vault-blob';

let dbPromise: Promise<IDBPDatabase<PairTrackDB>> | null = null;

function db(): Promise<IDBPDatabase<PairTrackDB>> {
  dbPromise ??= openDB<PairTrackDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      // v1 is the first schema. Future migrations branch on oldVersion here;
      // the encrypted blob carries its own schemaVersion for data migrations.
      if (oldVersion < 1) {
        database.createObjectStore('meta');
        database.createObjectStore('vault');
        database.createObjectStore('snapshots', { autoIncrement: true });
      }
    },
  });
  return dbPromise;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

// --- Vault meta (the only cleartext that matters) ---------------------------

export async function loadMeta(): Promise<VaultMeta | null> {
  const stored = await (await db()).get('meta', META_KEY);
  if (!stored) return null;

  return {
    kdf: stored.kdf,
    salt: new Uint8Array(stored.salt),
    verifier: {
      iv: new Uint8Array(stored.verifierIv),
      ciphertext: new Uint8Array(stored.verifierCiphertext),
    },
    createdAt: stored.createdAt,
  };
}

export async function saveMeta(meta: VaultMeta): Promise<void> {
  const stored: StoredMeta = {
    kdf: meta.kdf,
    salt: toArrayBuffer(meta.salt),
    verifierIv: toArrayBuffer(meta.verifier.iv),
    verifierCiphertext: toArrayBuffer(meta.verifier.ciphertext),
    createdAt: meta.createdAt,
  };
  await (await db()).put('meta', stored, META_KEY);
}

export async function hasVault(): Promise<boolean> {
  return (await loadMeta()) !== null;
}

// --- The encrypted blob -----------------------------------------------------

export function emptySettings(): Settings {
  return {
    engineerName: '',
    autoLockMinutes: 15,
    theme: 'dark',
    failReasons: DEFAULT_FAIL_REASONS.map((r) => ({ ...r })),
    view: { ...DEFAULT_VIEW },
    changesSinceBackup: 0,
    lastBackupAt: null,
  };
}

export function emptyVault(): Vault {
  return { schemaVersion: SCHEMA_VERSION, packs: [], activePackId: null, settings: emptySettings() };
}

/** Read and decrypt. Returns null when nothing has been saved yet. */
export async function loadVault(): Promise<Vault | null> {
  const stored = await (await db()).get('vault', VAULT_KEY);
  if (!stored) return null;

  const sealed: Sealed = {
    iv: new Uint8Array(stored.iv),
    ciphertext: new Uint8Array(stored.ciphertext),
  };

  const data = await decryptJson<Vault>(requireKey(), sealed);
  return migrate(data);
}

/**
 * Encrypt and write, then push the previous blob onto the snapshot ring.
 *
 * Order matters: the new blob is written first, so a crash mid-save leaves the
 * old blob intact rather than leaving no blob at all.
 */
export async function saveVault(vault: Vault, key: CryptoKey = requireKey()): Promise<void> {
  const database = await db();
  const previous = await database.get('vault', VAULT_KEY);

  const sealed = await encryptJson(key, vault);
  const stored: StoredBlob = {
    iv: toArrayBuffer(sealed.iv),
    ciphertext: toArrayBuffer(sealed.ciphertext),
    savedAt: new Date().toISOString(),
  };

  await database.put('vault', stored, VAULT_KEY);

  if (previous) await pushSnapshot(database, previous);
}

async function pushSnapshot(
  database: IDBPDatabase<PairTrackDB>,
  blob: StoredBlob,
): Promise<void> {
  await database.add('snapshots', blob);

  // Keep the ring to SNAPSHOT_RING_SIZE, oldest out first.
  const keys = await database.getAllKeys('snapshots');
  const excess = keys.length - SNAPSHOT_RING_SIZE;
  for (let i = 0; i < excess; i += 1) {
    const key = keys[i];
    if (key !== undefined) await database.delete('snapshots', key);
  }
}

export interface SnapshotInfo {
  readonly key: number;
  readonly savedAt: string;
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  const database = await db();
  const keys = await database.getAllKeys('snapshots');
  const values = await database.getAll('snapshots');
  return keys
    .map((key, i) => ({ key: key as number, savedAt: values[i]?.savedAt ?? '' }))
    .reverse();
}

export async function restoreSnapshot(key: number): Promise<Vault | null> {
  const stored = await (await db()).get('snapshots', key);
  if (!stored) return null;

  const data = await decryptJson<Vault>(requireKey(), {
    iv: new Uint8Array(stored.iv),
    ciphertext: new Uint8Array(stored.ciphertext),
  });
  return migrate(data);
}

// --- Debounced write-through ------------------------------------------------

const SAVE_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Vault | null = null;
let inFlight: Promise<void> = Promise.resolve();

/**
 * Queue a save. Coalesces rapid ticks — marking 20 jobs in a minute is one
 * write per 500ms, not 20 writes.
 */
export function queueSave(vault: Vault): void {
  pending = vault;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flushSave();
  }, SAVE_DEBOUNCE_MS);
}

/** Write any pending change immediately. Called before lock, export and unload. */
export async function flushSave(): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const vault = pending;
  pending = null;
  if (vault === null) return;

  inFlight = inFlight.then(() => saveVault(vault)).catch((error: unknown) => {
    console.error('pairtrack: save failed', error);
    // Put it back so the next flush retries rather than losing the change.
    pending = vault;
  });

  await inFlight;
}

export function hasPendingSave(): boolean {
  return pending !== null;
}

// --- Wipe -------------------------------------------------------------------

/** Confirm-by-typing wipe from settings — BRIEF §9.6. Irreversible by design. */
export async function wipeEverything(): Promise<void> {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  pending = null;

  const database = await db();
  await Promise.all([
    database.clear('vault'),
    database.clear('snapshots'),
    database.clear('meta'),
  ]);
  database.close();
  dbPromise = null;
  await deleteDatabase();
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/** Test seam — drops the cached connection so each test gets a fresh DB. */
export function __resetDbForTests(): void {
  dbPromise = null;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  pending = null;
}

// --- Migrations -------------------------------------------------------------

/**
 * Bring a decrypted vault up to the current schema.
 *
 * Defensive rather than clever: fill in anything a newer version added, so an
 * old blob never crashes the app on launch.
 */
function migrate(vault: Vault): Vault {
  const settings = { ...emptySettings(), ...vault.settings };
  settings.view = { ...DEFAULT_VIEW, ...vault.settings?.view };
  if (!Array.isArray(settings.failReasons) || settings.failReasons.length === 0) {
    settings.failReasons = DEFAULT_FAIL_REASONS.map((r) => ({ ...r }));
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    packs: (vault.packs ?? []).map((pack) => ({
      ...pack,
      jobs: (pack.jobs ?? []).map((job) => ({ ...job, history: job.history ?? [] })),
    })),
    activePackId: vault.activePackId ?? null,
    settings,
  };
}
