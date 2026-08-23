/**
 * Changing the passphrase — BRIEF §9.6, D13.
 *
 * Extracted from SettingsScreen because the ORDER of these four steps is the
 * entire correctness argument, and buried in a component it could not be tested.
 * It was wrong: the snapshot was taken before the flush, so the flush wrote the
 * newest state to disk and the re-key then wrote the older snapshot back over
 * it. A tick made during the flush stayed on screen and in memory and was gone
 * on the next unlock — the silent kind of loss, discovered a day later.
 *
 * `readVault` is passed in rather than imported from `src/state/` so that
 * `src/data/` keeps its one-way dependency on the layers below it, and so a
 * test can simulate a change landing mid-flush.
 */
import { rederiveForNewPassphrase } from '../crypto/vault';
import { flushSave, rekeyVault } from './repository';
import type { Vault } from './types';

export async function changePassphrase(
  newPassphrase: string,
  readVault: () => Vault | null,
): Promise<void> {
  // 1. Derive first. ~600,000 PBKDF2 iterations with the UI still live, so this
  //    is much the longest window here. Anything the engineer does during it
  //    must survive, which is what steps 2 and 3 are for.
  const { meta, key } = await rederiveForNewPassphrase(newPassphrase);

  // 2. Flush BEFORE the snapshot. Whatever is sitting in the 500ms debounce
  //    belongs to the OLD key and has to reach disk while that key is still the
  //    live one.
  await flushSave();

  // 3. Snapshot AFTER the flush — this is the fix. Reading the vault first and
  //    flushing second meant re-encrypting a view of the data that was already
  //    stale by the time it was written, silently reverting the flush.
  const current = readVault();
  if (current === null) throw new Error('Locked');

  // 4. Blob and verifier in ONE transaction, adopting the key inside the same
  //    critical section. A save that queues during this runs afterwards and
  //    picks up the settled key, so it cannot land under the old one.
  await rekeyVault(current, key, meta);
}
