/**
 * All references in this file are fabricated — no value here comes from the
 * real pack. See BRIEF.md section 5.2.
 * no-data-scan: synthetic
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyVault } from '../../src/data/repository';
import { deriveStatus, emptyProgress } from '../../src/data/transitions';
import type { Job, Pack } from '../../src/data/types';
import { buildJobs } from '../../src/import/buildJobs';
import { detectRoles } from '../../src/import/columns';
import { signOffPending, toggleJobDone } from '../../src/state/actions';
import {
  activePack,
  getState,
  performUndo,
  setState,
  __resetStoreForTests,
} from '../../src/state/store';
import { syntheticHeaders, syntheticRows } from './fixtures/syntheticPack';

const NOW = '2026-08-22T10:33:00.000Z';

function makePack(rows: number): Pack {
  const headers = syntheticHeaders();
  const mapping = detectRoles(headers);
  const { jobs } = buildJobs(syntheticRows({ rows }), headers, mapping, NOW);
  return {
    id: 'test-pack',
    name: 'Test pack',
    columns: headers,
    constantColumns: {},
    columnMapping: mapping,
    importedAt: NOW,
    lastImportedAt: NOW,
    originalFileName: 'test.xlsx',
    jobs: jobs.map((job) => ({ ...job, progress: emptyProgress(NOW) })),
  };
}

function load(rows: number) {
  const vault = emptyVault();
  const pack = makePack(rows);
  vault.packs = [pack];
  vault.activePackId = pack.id;
  vault.settings.engineerName = 'Test Engineer';
  setState({ vault, screen: { name: 'list' } });
}

function jobs(): Job[] {
  return activePack()?.jobs ?? [];
}

beforeEach(() => {
  __resetStoreForTests();
  load(6);
});

describe('batch sign-off is recoverable', () => {
  it('signs off only the jobs he actually ticked', () => {
    toggleJobDone(jobs()[0]!.id);
    toggleJobDone(jobs()[1]!.id);

    expect(signOffPending()).toBe(2);

    const statuses = jobs().map((job) => deriveStatus(job.progress));
    expect(statuses.filter((s) => s === 'signed-off')).toHaveLength(2);
    expect(statuses.filter((s) => s === 'outstanding')).toHaveLength(4);
  });

  it('offers one undo for the whole batch', () => {
    toggleJobDone(jobs()[0]!.id);
    toggleJobDone(jobs()[1]!.id);
    toggleJobDone(jobs()[2]!.id);
    signOffPending();

    const undo = getState().undo;
    expect(undo).not.toBeNull();
    expect(undo!.previous).toHaveLength(3);
    expect(undo!.label).toContain('3');
  });

  it('undo restores the ORIGINAL done timestamps, which re-ticking cannot', () => {
    // This is the whole point. An accidental sign-off cannot be reversed by
    // un-ticking and re-ticking: that stamps "now" and loses the time the work
    // actually happened at the frame, which is the one timestamp the office
    // gets. The snapshot puts the real times back.
    toggleJobDone(jobs()[0]!.id);
    toggleJobDone(jobs()[1]!.id);

    const doneAtBefore = jobs()
      .filter((job) => job.progress.doneAt !== null)
      .map((job) => job.progress.doneAt);
    expect(doneAtBefore).toHaveLength(2);

    signOffPending();
    performUndo();

    const after = jobs().filter((job) => job.progress.doneAt !== null);
    expect(after.map((job) => job.progress.doneAt)).toEqual(doneAtBefore);
    // Back to pending: done, not signed off.
    for (const job of after) {
      expect(job.progress.signedOffAt).toBeNull();
      expect(deriveStatus(job.progress)).toBe('pending');
    }
  });

  it('signing off with nothing pending does nothing and offers no undo', () => {
    expect(signOffPending()).toBe(0);
    expect(getState().undo).toBeNull();
  });

  it('leaves the session counter where it started after sign-off then undo', () => {
    // Signing off is not new work: those jobs were counted when he ticked them.
    // The forward action added 1 while undo subtracted one-per-job, so undoing
    // a 3-job batch drove "3 done this session" to zero and the header lied
    // about a morning's work.
    toggleJobDone(jobs()[0]!.id);
    toggleJobDone(jobs()[1]!.id);
    toggleJobDone(jobs()[2]!.id);
    const afterTicking = getState().session.changes;
    expect(afterTicking).toBe(3);

    signOffPending();
    expect(getState().session.changes).toBe(3);

    performUndo();
    expect(getState().session.changes).toBe(3);
  });

  it('still counts backup pressure for a batch, one per job', () => {
    // The session counter and backup pressure are different questions. Nothing
    // new was done, but 3 records changed on disk and are not in any backup.
    toggleJobDone(jobs()[0]!.id);
    toggleJobDone(jobs()[1]!.id);
    const before = getState().vault!.settings.changesSinceBackup;

    signOffPending();

    expect(getState().vault!.settings.changesSinceBackup).toBe(before + 2);
  });

  it('signing off twice does not re-stamp the first batch', () => {
    toggleJobDone(jobs()[0]!.id);
    signOffPending();
    const firstSignedOff = jobs()[0]!.progress.signedOffAt;

    toggleJobDone(jobs()[1]!.id);
    expect(signOffPending()).toBe(1);

    expect(jobs()[0]!.progress.signedOffAt).toBe(firstSignedOff);
  });
});
