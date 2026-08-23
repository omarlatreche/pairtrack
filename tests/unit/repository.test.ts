import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  __resetDbForTests,
  emptyVault,
  flushSave,
  hasPendingSave,
  hasVault,
  listSnapshots,
  loadMeta,
  loadVault,
  queueSave,
  restoreSnapshot,
  saveMeta,
  saveVault,
  wipeEverything,
} from '../../src/data/repository';
import { createVault, lock, unlock, __resetThrottleForTests } from '../../src/crypto/vault';
import { buildJobs } from '../../src/import/buildJobs';
import { detectRoles } from '../../src/import/columns';
import { toggleDone } from '../../src/data/transitions';
import type { Pack, Vault } from '../../src/data/types';
import { SCHEMA_VERSION } from '../../src/data/types';
import { syntheticHeaders, syntheticRows } from './fixtures/syntheticPack';

const NOW = '2026-08-22T10:33:00.000Z';
const PASSPHRASE = 'purple frame ladder Tuesday';

function makePack(rows = 20): Pack {
  const headers = syntheticHeaders();
  const mapping = detectRoles(headers);
  const { jobs } = buildJobs(syntheticRows({ rows }), headers, mapping, NOW);

  return {
    id: 'test-pack',
    name: 'Test pack',
    columns: headers,
    constantColumns: { DB: 'LW' },
    columnMapping: mapping,
    importedAt: NOW,
    lastImportedAt: NOW,
    originalFileName: 'test.xlsx',
    jobs,
  };
}

function vaultWith(pack: Pack): Vault {
  const vault = emptyVault();
  vault.packs = [pack];
  vault.activePackId = pack.id;
  vault.settings.engineerName = 'Test Engineer';
  return vault;
}

beforeEach(async () => {
  // A fresh in-memory IndexedDB per test.
  globalThis.indexedDB = new IDBFactory();
  __resetDbForTests();
  __resetThrottleForTests();
  lock();
  await createVault(PASSPHRASE);
});

afterEach(() => {
  lock();
});

describe('vault meta', () => {
  it('reports no vault before setup', async () => {
    globalThis.indexedDB = new IDBFactory();
    __resetDbForTests();
    expect(await hasVault()).toBe(false);
  });

  it('round-trips the salt, KDF params and verifier', async () => {
    lock();
    __resetThrottleForTests();
    const meta = await createVault(PASSPHRASE);
    await saveMeta(meta);

    const loaded = await loadMeta();
    expect(loaded).not.toBeNull();
    expect(loaded?.kdf).toEqual(meta.kdf);
    expect([...(loaded?.salt ?? [])]).toEqual([...meta.salt]);
    expect(await hasVault()).toBe(true);
  }, 30_000);

  it('unlocks from stored meta with the right passphrase only', async () => {
    lock();
    __resetThrottleForTests();
    const meta = await createVault(PASSPHRASE);
    await saveMeta(meta);
    lock();

    const stored = await loadMeta();
    expect(stored).not.toBeNull();

    await expect(unlock('the wrong passphrase', stored!)).rejects.toThrow(/incorrect passphrase/i);
    await unlock(PASSPHRASE, stored!);
    expect(await loadVault()).toBeNull(); // meta saved, blob not yet
  }, 60_000);
});

describe('encrypted store', () => {
  it('round-trips a full pack', async () => {
    const vault = vaultWith(makePack(50));
    await saveVault(vault);

    const loaded = await loadVault();
    expect(loaded).not.toBeNull();
    expect(loaded?.packs[0]?.jobs).toHaveLength(50);
    expect(loaded?.packs[0]?.jobs[0]?.jobNumber).toBe(vault.packs[0]?.jobs[0]?.jobNumber);
    expect(loaded?.settings.engineerName).toBe('Test Engineer');
    expect(loaded?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('preserves progress and history through a save/load cycle', async () => {
    const pack = makePack(10);
    const job = pack.jobs[0]!;
    const change = toggleDone(job, NOW, 'Test Engineer');
    pack.jobs[0] = { ...job, progress: change.progress, history: [] };

    await saveVault(vaultWith(pack));
    const loaded = await loadVault();

    expect(loaded?.packs[0]?.jobs[0]?.progress.doneAt).toBe(NOW);
    expect(loaded?.packs[0]?.jobs[0]?.progress.completedBy).toBe('Test Engineer');
    expect(loaded?.packs[0]?.jobs[0]?.history).toHaveLength(0);
  });

  it('returns null when nothing has been saved', async () => {
    expect(await loadVault()).toBeNull();
  });

  it('refuses to read once locked', async () => {
    await saveVault(vaultWith(makePack(5)));
    lock();
    await expect(loadVault()).rejects.toThrow(/locked/i);
  });
});

/**
 * BRIEF §11: "IndexedDB contains no readable circuit/telephone number, job
 * number or note." This is the check that matters most — the pack is personal
 * data. The test reads the raw stored records and asserts no plaintext.
 */
describe('nothing readable is written to IndexedDB', () => {
  it('stores no job number, circuit number or engineer name in the clear', async () => {
    const pack = makePack(30);
    const job = pack.jobs[0]!;
    // Notes are gone (D17), so the canary rides on the one free-text field
    // left: the engineer's name, written on every job he ticks.
    const secretNote = 'JUMPER-MISSING-CANARY-STRING';
    pack.jobs[0] = { ...job, progress: { ...job.progress, completedBy: secretNote } };

    const jobNumber = job.jobNumber;
    const circuit = job.source.Circuit!;
    const barPair = job.source['MDF BAR PAIR']!;
    const equipment = job.source.Old_Equipment!;

    await saveVault(vaultWith(pack));

    // Read every record out of the raw database, exactly as DevTools would.
    const raw = await dumpDatabase();

    for (const needle of [secretNote, jobNumber, circuit, barPair, equipment, 'Test Engineer']) {
      expect(raw).not.toContain(needle);
    }

    // The dump must actually contain the ciphertext, or the assertions above
    // pass vacuously. 30 jobs seal to several kilobytes.
    expect(raw.length).toBeGreaterThan(2000);
  });

  it('positive control: the same dump does find plaintext when it is there', async () => {
    // Proves the check above can fail. Write the note unencrypted into the same
    // database and confirm the dump surfaces it.
    const canary = 'PLAINTEXT-CANARY-THAT-MUST-BE-FOUND';
    const { openDB } = await import('idb');
    const db = await openDB('pairtrack', 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
        if (!database.objectStoreNames.contains('vault')) database.createObjectStore('vault');
        if (!database.objectStoreNames.contains('snapshots')) {
          database.createObjectStore('snapshots', { autoIncrement: true });
        }
      },
    });
    await db.put('meta', { leaked: canary, createdAt: NOW } as never, 'leak-test');
    db.close();

    expect(await dumpDatabase()).toContain(canary);
  });

  it('stores the salt and verifier but no passphrase', async () => {
    lock();
    __resetThrottleForTests();
    const meta = await createVault(PASSPHRASE);
    await saveMeta(meta);

    const raw = await dumpDatabase();
    expect(raw).not.toContain(PASSPHRASE);
    // The KDF parameters are stored in the clear on purpose, so they can be
    // migrated later.
    expect(raw).toContain('PBKDF2');
  }, 30_000);
});

/**
 * Serialise the whole IndexedDB to a string, binary included — the programmatic
 * equivalent of reading every record in the DevTools Application panel.
 *
 * Buffers are flattened to latin-1 text rather than JSON-stringified: an
 * ArrayBuffer serialises to `{}`, which would make the test pass vacuously.
 */
async function dumpDatabase(): Promise<string> {
  const { openDB } = await import('idb');
  const db = await openDB('pairtrack', 1);
  const chunks: string[] = [];

  for (const storeName of [...db.objectStoreNames]) {
    for (const value of await db.getAll(storeName)) {
      chunks.push(flatten(value));
    }
  }

  db.close();
  return chunks.join('\n');
}

function flatten(value: unknown): string {
  if (value === null || value === undefined) return String(value);

  // Duck-typed rather than `instanceof`: fake-indexeddb hands back buffers from
  // its own realm, so `instanceof ArrayBuffer` is false and every byte would be
  // silently skipped.
  if (typeof value === 'object') {
    const maybeBuffer = value as { byteLength?: unknown; buffer?: unknown };
    if (typeof maybeBuffer.byteLength === 'number') {
      const bytes =
        maybeBuffer.buffer !== undefined
          ? new Uint8Array(maybeBuffer.buffer as ArrayBuffer)
          : new Uint8Array(value as ArrayBuffer);
      return latin1(bytes);
    }
    if (Array.isArray(value)) return value.map(flatten).join(' ');
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${key}=${flatten(inner)}`)
      .join(' ');
  }

  return String(value);
}

/** Bytes as latin-1 text, so any embedded plaintext would show up verbatim. */
function latin1(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

describe('snapshot rollback ring', () => {
  it('keeps the previous blob after each save, capped at five', async () => {
    const pack = makePack(5);

    for (let i = 0; i < 8; i += 1) {
      const vault = vaultWith(pack);
      vault.settings.engineerName = `Engineer ${i}`;
      await saveVault(vault);
    }

    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(5);
  });

  it('restores a previous snapshot', async () => {
    const pack = makePack(5);

    const first = vaultWith(pack);
    first.settings.engineerName = 'First';
    await saveVault(first);

    const second = vaultWith(pack);
    second.settings.engineerName = 'Second';
    await saveVault(second);

    const snapshots = await listSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);

    const restored = await restoreSnapshot(snapshots[0]!.key);
    expect(restored?.settings.engineerName).toBe('First');
  });
});

describe('debounced write-through', () => {
  it('coalesces rapid changes into one write and never loses the last one', async () => {
    const pack = makePack(5);

    for (let i = 0; i < 20; i += 1) {
      const vault = vaultWith(pack);
      vault.settings.engineerName = `Engineer ${i}`;
      queueSave(vault);
    }

    await flushSave();

    const loaded = await loadVault();
    expect(loaded?.settings.engineerName).toBe('Engineer 19');

    // 20 ticks produced one write, so the ring holds nothing yet.
    expect(await listSnapshots()).toHaveLength(0);
  });

  it('flushing with nothing pending is a no-op', async () => {
    await expect(flushSave()).resolves.toBeUndefined();
  });
});

describe('wipe', () => {
  it('removes everything, irreversibly', async () => {
    await saveVault(vaultWith(makePack(10)));
    const meta = await loadMeta();
    expect(meta).toBeNull(); // saveMeta was not called in this test

    await wipeEverything();
    __resetDbForTests();

    expect(await hasVault()).toBe(false);
    expect(await loadVault()).toBeNull();
  });
});

describe('migration', () => {
  it('fills in fields a newer version added, rather than crashing', async () => {
    // A vault written by a hypothetical older build: no settings.view, no history.
    const pack = makePack(3);
    const legacy = {
      schemaVersion: 1,
      packs: [{ ...pack, jobs: pack.jobs.map(({ ...job }) => ({ ...job, history: undefined })) }],
      activePackId: pack.id,
      settings: { engineerName: 'Old', autoLockMinutes: 5 },
    } as unknown as Vault;

    await saveVault(legacy);
    const loaded = await loadVault();

    expect(loaded?.settings.view).toBeDefined();
    expect(loaded?.settings.view.sortField).toBe('framePosition');
    expect(loaded?.settings.engineerName).toBe('Old');
    expect(loaded?.settings.autoLockMinutes).toBe(5);
    expect(loaded?.packs[0]?.jobs[0]?.history).toEqual([]);
  });
});

/**
 * Regressions from review. The first is the worst failure the app can have:
 * a re-key that half-lands leaves data no passphrase can open.
 */
describe('re-keying is atomic and exclusive', () => {
  it('the blob and the verifier are always for the same passphrase', async () => {
    const { rederiveForNewPassphrase } = await import('../../src/crypto/vault');
    const { rekeyVault } = await import('../../src/data/repository');

    const pack = makePack(10);
    const vault = vaultWith(pack);
    const firstMeta = await loadMetaOrCreate();
    await saveVault(vault);
    await saveMeta(firstMeta);

    const NEW_PASSPHRASE = 'a different long passphrase';
    const { meta, key } = await rederiveForNewPassphrase(NEW_PASSPHRASE);
    await rekeyVault(vault, key, meta);

    // The stored meta must open the stored blob. If these two ever disagree,
    // neither the old nor the new passphrase works and there is no recovery.
    lock();
    __resetThrottleForTests();
    const stored = await loadMeta();
    expect(stored).not.toBeNull();

    await unlock(NEW_PASSPHRASE, stored!);
    const loaded = await loadVault();
    expect(loaded?.packs[0]?.jobs).toHaveLength(10);
  }, 90_000);

  it('a save queued during a re-key does not land under the old key', async () => {
    // The transaction alone did not fix this. Re-keying awaits 600k PBKDF2
    // iterations and then IndexedDB with the UI live, so an ordinary debounced
    // save could seal with the still-current OLD key and land AFTER the new
    // verifier — leaving a blob neither passphrase opens.
    const { rederiveForNewPassphrase } = await import('../../src/crypto/vault');
    const { rekeyVault } = await import('../../src/data/repository');

    const firstMeta = await loadMetaOrCreate();
    await saveVault(vaultWith(makePack(10)));
    await saveMeta(firstMeta);

    const NEW_PASSPHRASE = 'yet another long passphrase';
    const { meta, key } = await rederiveForNewPassphrase(NEW_PASSPHRASE);

    // Fire a save into the middle of the re-key, exactly as a tick would.
    const rekeying = rekeyVault(vaultWith(makePack(12)), key, meta);
    queueSave(vaultWith(makePack(14)));
    const flushing = flushSave();

    await Promise.all([rekeying, flushing]);

    // Whatever order they ran in, the stored blob must open with the NEW
    // passphrase — the queue guarantees the save saw the settled key.
    lock();
    __resetThrottleForTests();
    const stored = await loadMeta();
    await unlock(NEW_PASSPHRASE, stored!);

    // Assert the NEWEST state survived, not merely that something did. This
    // used to be `toBeGreaterThan(0)`, which passes even when the re-key writes
    // its older snapshot over the save that followed it — the exact regression
    // the test exists to catch.
    const loaded = await loadVault();
    expect(loaded?.packs[0]?.jobs).toHaveLength(14);
  }, 120_000);

  async function loadMetaOrCreate() {
    const existing = await loadMeta();
    if (existing !== null) return existing;
    lock();
    __resetThrottleForTests();
    return createVault(PASSPHRASE);
  }
});

describe('flushSave reports failure instead of swallowing it', () => {
  it('rejects when the write really fails, so callers are not told a comforting lie', async () => {
    // A genuinely failing write, not a no-op. The database is made unopenable
    // underneath the repository, which is the same shape as a quota error or
    // eviction: flushSave must surface it rather than resolving as though the
    // data were safely on disk.
    const workingIndexedDB = globalThis.indexedDB;
    __resetDbForTests();
    globalThis.indexedDB = {
      open() {
        const request: Record<string, unknown> = { error: new Error('storage unavailable') };
        queueMicrotask(() => {
          (request.onerror as ((e: unknown) => void) | undefined)?.({ target: request });
        });
        return request;
      },
      deleteDatabase: workingIndexedDB.deleteDatabase.bind(workingIndexedDB),
    } as unknown as IDBFactory;

    queueSave(vaultWith(makePack(5)));

    await expect(flushSave()).rejects.toBeDefined();

    // And the change is kept for a retry rather than dropped on the floor.
    expect(hasPendingSave()).toBe(true);

    globalThis.indexedDB = workingIndexedDB;
    __resetDbForTests();
  });

  it('a later failure does not poison the queue for the next write', async () => {
    // The queue tail is reset on failure, so one bad write must not make every
    // subsequent save reject for the life of the session.
    await saveVault(vaultWith(makePack(3)));
    queueSave(vaultWith(makePack(4)));
    await expect(flushSave()).resolves.toBeUndefined();

    const loaded = await loadVault();
    expect(loaded?.packs[0]?.jobs).toHaveLength(4);
  });

  it('drops pending plaintext the moment the vault locks', async () => {
    const pack = makePack(20);
    queueSave(vaultWith(pack));
    expect(hasPendingSave()).toBe(true);

    // `pending` holds a fully DECRYPTED vault. Once the key is gone it must
    // not linger on the heap through the lock screen (BRIEF §9.4).
    lock();
    expect(hasPendingSave()).toBe(false);
  });
});

describe('regressions: key adoption and snapshot ordering', () => {
  it('a failed re-key does not adopt the new key, so the old passphrase still works', async () => {
    // The worst failure the app can have (D13), approached from the write side.
    // If the key is adopted before the write is known to have landed, the live
    // key ends up with no verifier on disk: the old passphrase then passes the
    // verifier and decrypts nothing, the new one fails the verifier, and there
    // is no reset.
    const { deriveNewVault, requireKey } = await import('../../src/crypto/vault');
    const { rekeyVault } = await import('../../src/data/repository');

    await saveVault(vaultWith(makePack(10)));
    const keyBefore = requireKey();

    const { meta, key } = await deriveNewVault('an entirely different passphrase');

    // Break the database underneath the write, the same shape as a quota error.
    const workingIndexedDB = globalThis.indexedDB;
    __resetDbForTests();
    globalThis.indexedDB = {
      open() {
        const request: Record<string, unknown> = { error: new Error('storage unavailable') };
        queueMicrotask(() => {
          (request.onerror as ((e: unknown) => void) | undefined)?.({ target: request });
        });
        return request;
      },
    } as unknown as IDBFactory;

    await expect(rekeyVault(vaultWith(makePack(10)), key, meta)).rejects.toBeDefined();

    // The session key must be untouched.
    expect(requireKey()).toBe(keyBefore);

    globalThis.indexedDB = workingIndexedDB;
    __resetDbForTests();

    // And it must still be the key that opens what is actually on disk.
    const loaded = await loadVault();
    expect(loaded?.packs[0]?.jobs).toHaveLength(10);
  }, 120_000);

  it('restoring a backup that cannot be persisted leaves the current vault open', async () => {
    // Restore is the recovery path — it runs when he is already in trouble, so
    // a failure here must not be the thing that finishes the job off.
    const { createBackup } = await import('../../src/export/backup');
    const { restoreFromBackupText } = await import('../../src/data/restore');
    const { requireKey } = await import('../../src/crypto/vault');

    await saveVault(vaultWith(makePack(10)));
    const keyBefore = requireKey();

    const BACKUP_PASSPHRASE = 'the backup had its own passphrase';
    const backupBlob = await createBackup(vaultWith(makePack(7)), BACKUP_PASSPHRASE);
    // jsdom's Blob implements neither .text() nor .arrayBuffer(); FileReader it is.
    const backupText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(backupBlob);
    });

    const workingIndexedDB = globalThis.indexedDB;
    __resetDbForTests();
    globalThis.indexedDB = {
      open() {
        const request: Record<string, unknown> = { error: new Error('storage unavailable') };
        queueMicrotask(() => {
          (request.onerror as ((e: unknown) => void) | undefined)?.({ target: request });
        });
        return request;
      },
    } as unknown as IDBFactory;

    await expect(restoreFromBackupText(backupText, BACKUP_PASSPHRASE)).rejects.toBeDefined();

    // The backup's passphrase must NOT have become the live key.
    expect(requireKey()).toBe(keyBefore);

    globalThis.indexedDB = workingIndexedDB;
    __resetDbForTests();

    const loaded = await loadVault();
    expect(loaded?.packs[0]?.jobs).toHaveLength(10);
  }, 120_000);

  it('a passphrase change re-encrypts the state that exists AFTER the flush', async () => {
    // The snapshot used to be taken before the flush. The flush then wrote the
    // newest state and the re-key wrote the older snapshot back over it, so a
    // tick made during the flush stayed on screen and in memory but never
    // reached disk — found only on the next unlock, a day later.
    const { changePassphrase } = await import('../../src/data/changePassphrase');

    // beforeEach creates a vault but does not persist its meta, and this test
    // has to unlock from disk at the end.
    lock();
    __resetThrottleForTests();
    const firstMeta = await createVault(PASSPHRASE);
    await saveVault(vaultWith(makePack(10)));
    await saveMeta(firstMeta);

    // A tick sitting in the 500ms debounce, exactly as one would be.
    queueSave(vaultWith(makePack(14)));

    // Stands in for the live store: while the repository still holds a pending
    // write, the caller's view is the stale one. Snapshot before the flush and
    // this returns 10; snapshot after it and it returns 14.
    const readVault = () => vaultWith(makePack(hasPendingSave() ? 10 : 14));

    const NEW_PASSPHRASE = 'a brand new and quite long passphrase';
    await changePassphrase(NEW_PASSPHRASE, readVault);

    lock();
    __resetThrottleForTests();
    await unlock(NEW_PASSPHRASE, (await loadMeta())!);

    const loaded = await loadVault();
    expect(loaded?.packs[0]?.jobs).toHaveLength(14);
  }, 120_000);
});

describe('v1 -> v2 migration of an existing vault', () => {
  /**
   * The EXACT persisted shape of the previous release, written out rather than
   * imported: the old types no longer exist, and a migration test that uses the
   * new types cannot fail the way a real old vault does.
   */
  function v1Progress(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      readyToActivate: null,
      activatedAt: null,
      testStatus: null,
      testedAt: null,
      completedAt: null,
      completedBy: null,
      failReason: null,
      vert: null,
      up: null,
      notes: '',
      locked: false,
      updatedAt: NOW,
      ...over,
    };
  }

  function v1Vault(progresses: Record<string, unknown>[]): unknown {
    const pack = makePack(progresses.length);
    return {
      schemaVersion: 1,
      activePackId: pack.id,
      packs: [
        {
          ...pack,
          jobs: pack.jobs.map((job, i) => ({ ...job, progress: progresses[i], history: [] })),
        },
      ],
      settings: {
        engineerName: 'Old',
        autoLockMinutes: 5,
        theme: 'dark',
        failReasons: [{ code: 'bar-pair-not-as-documented', label: 'Bar pair wrong', enabled: true }],
        view: { sortField: 'framePosition', sortDirection: 'asc', group: 'none', status: 'activated', jobType: null, frame: null, search: '' },
        changesSinceBackup: 0,
        lastBackupAt: null,
      },
    };
  }

  it('does not report untouched jobs as signed off', async () => {
    // The bug: signedOffAt is absent on a v1 job, and `undefined !== null` is
    // true, so deriveStatus called EVERY job signed off. A returning engineer
    // would open a fresh pack and be told all 442 were finished.
    const { migrate } = await import('../../src/data/repository');
    const { deriveStatus } = await import('../../src/data/transitions');

    const migrated = migrate(v1Vault([v1Progress(), v1Progress()]) as never);

    for (const job of migrated.packs[0]!.jobs) {
      expect(job.progress.signedOffAt).toBeNull();
      expect(deriveStatus(job.progress)).toBe('outstanding');
    }
  });

  it('carries a finished job across as done, awaiting sign-off', async () => {
    const { migrate } = await import('../../src/data/repository');
    const { deriveStatus } = await import('../../src/data/transitions');

    const migrated = migrate(
      v1Vault([
        v1Progress({
          readyToActivate: 'yes',
          activatedAt: NOW,
          testStatus: 'pass',
          testedAt: NOW,
          completedAt: NOW,
          completedBy: 'Old Engineer',
        }),
      ]) as never,
    );

    const progress = migrated.packs[0]!.jobs[0]!.progress;
    expect(progress.doneAt).toBe(NOW);
    expect(progress.completedBy).toBe('Old Engineer');
    // Sign-off did not exist in v1, so it cannot be asserted on his behalf.
    expect(progress.signedOffAt).toBeNull();
    expect(deriveStatus(progress)).toBe('pending');
  });

  it('does not claim a part-finished job is done', async () => {
    // Under-claiming is the safe direction. Marking a half-done job "done"
    // means he skips it and a circuit never moves; marking a done job
    // "not done" costs him one re-check at the frame.
    const { migrate } = await import('../../src/data/repository');
    const { deriveStatus } = await import('../../src/data/transitions');

    const migrated = migrate(
      v1Vault([
        v1Progress({ readyToActivate: 'yes', activatedAt: NOW }),
        v1Progress({ readyToActivate: 'failed', activatedAt: NOW, failReason: 'x' }),
      ]) as never,
    );

    for (const job of migrated.packs[0]!.jobs) {
      expect(deriveStatus(job.progress)).toBe('outstanding');
      expect(job.progress.doneAt).toBeNull();
    }
  });

  it('drops v1 fields rather than carrying them along as dead weight', async () => {
    const { migrate } = await import('../../src/data/repository');
    const migrated = migrate(v1Vault([v1Progress({ notes: 'old note', locked: true })]) as never);

    const progress = migrated.packs[0]!.jobs[0]!.progress as unknown as Record<string, unknown>;
    for (const gone of ['readyToActivate', 'testStatus', 'notes', 'locked', 'vert', 'up']) {
      expect(progress[gone]).toBeUndefined();
    }
  });

  it('resets a status filter that no longer exists, instead of showing nothing', async () => {
    // settings.view.status persisted as 'activated'. Left alone it matches no
    // job, so the app opens on an empty list and looks broken.
    const { migrate } = await import('../../src/data/repository');
    const migrated = migrate(v1Vault([v1Progress()]) as never);
    expect(migrated.settings.view.status).toBe('all');
  });

  it('stamps the new schema version', async () => {
    const { migrate } = await import('../../src/data/repository');
    const { SCHEMA_VERSION } = await import('../../src/data/types');
    expect(migrate(v1Vault([v1Progress()]) as never).schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
  });
});
