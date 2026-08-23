/**
 * All references in this file are fabricated — no value here comes from the
 * real pack. See BRIEF.md section 5.2.
 * no-data-scan: synthetic
 */
import { describe, expect, it } from 'vitest';
import { compareBarPair, blockKey, formatBarPair, parseBarPair } from '../../src/data/barPair';
import { naturalCompare, normaliseForSearch } from '../../src/data/naturalSort';
import {
  currentGate,
  deriveStatus,
  emptyProgress,
  failGate,
  hasProgress,
  isLegalTransition,
  passGate,
  revertGate,
  setGate,
} from '../../src/data/transitions';
import { countJobs, matchesSearch, oldShelfOf, sortJobs, applyView, groupJobs } from '../../src/data/view';
import { DEFAULT_VIEW, type Job } from '../../src/data/types';
import { buildJobs } from '../../src/import/buildJobs';
import { detectRoles } from '../../src/import/columns';
import { syntheticHeaders, syntheticRows } from './fixtures/syntheticPack';

const NOW = '2026-08-22T10:33:00.000Z';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'TEST1',
    source: {},
    seq: 1,
    jobNumber: 'TEST1',
    barPair: parseBarPair('01/A100'),
    jobType: 'no-ties',
    defects: [],
    progress: emptyProgress(NOW),
    history: [],
    missingSince: null,
    ...overrides,
  };
}

describe('natural sort', () => {
  it('sorts V2 before V10', () => {
    expect(naturalCompare('V2', 'V10')).toBeLessThan(0);
    expect(['V10', 'V2', 'V1'].sort(naturalCompare)).toEqual(['V1', 'V2', 'V10']);
  });

  it('sorts ABC123/4 before ABC456/7', () => {
    expect(naturalCompare('ABC123/4', 'ABC456/7')).toBeLessThan(0);
  });

  it('orders a mixed alphanumeric list the way a human would', () => {
    const input = ['A10', 'A9', 'A100', 'B1', 'A1', 'A2', 'B10', 'A20'];
    expect([...input].sort(naturalCompare)).toEqual([
      'A1', 'A2', 'A9', 'A10', 'A20', 'A100', 'B1', 'B10',
    ]);
  });

  it('is a total order — reversing the input gives the same result', () => {
    const input = ['Q900/3', 'Q90/3', 'Q9/3', 'R1/3', 'Q1000/3'];
    const forward = [...input].sort(naturalCompare);
    const backward = [...input].reverse().sort(naturalCompare);
    expect(forward).toEqual(backward);
  });

  it('treats equal strings as equal', () => {
    expect(naturalCompare('SAME1', 'SAME1')).toBe(0);
  });

  it('normalises for search, case- and separator-insensitively', () => {
    expect(normaliseForSearch('QQA 144')).toBe('qqa144');
    expect(normaliseForSearch('qqa-144')).toBe('qqa144');
    expect(normaliseForSearch('QQA123/4')).toBe('qqa1234');
  });
});

describe('bar pair parsing', () => {
  it('parses frame, block and numeric pair', () => {
    const parsed = parseBarPair('01/U9001');
    expect(parsed).toEqual({ frame: '01', block: 'U', number: 9001, raw: '01/U9001' });
  });

  it('parses the INTL block on frame 09', () => {
    expect(parseBarPair('09/INTL0021')).toMatchObject({ frame: '09', block: 'INTL', number: 21 });
  });

  it('pads a single-digit frame so 1 and 01 are one frame', () => {
    expect(parseBarPair('1/A5')?.frame).toBe('01');
  });

  it('returns null for the bare 0 in the real pack, rather than throwing', () => {
    expect(parseBarPair('0')).toBeNull();
  });

  it('returns null for empty, null and undefined', () => {
    expect(parseBarPair('')).toBeNull();
    expect(parseBarPair(null)).toBeNull();
    expect(parseBarPair(undefined)).toBeNull();
  });

  it('formats an unparseable pair as Unplaced', () => {
    expect(formatBarPair(null)).toBe('Unplaced');
    expect(formatBarPair(parseBarPair('01/U9001'))).toBe('01/U9001');
  });

  it('groups by frame and block', () => {
    expect(blockKey(parseBarPair('01/N9002'))).toBe('01/N');
    expect(blockKey(null)).toBe('Unplaced');
  });
});

describe('frame walk order', () => {
  it('sorts frame, then block, then pair numerically', () => {
    const raws = ['09/INTL5', '01/B10', '01/A100', '01/A9', '01/B2'];
    const sorted = raws
      .map(parseBarPair)
      .sort(compareBarPair)
      .map((p) => p?.raw);
    expect(sorted).toEqual(['01/A9', '01/A100', '01/B2', '01/B10', '09/INTL5']);
  });

  it('puts an unparseable pair last, in Unplaced, rather than breaking the sort', () => {
    const jobs = [
      makeJob({ id: 'bad', seq: 3, barPair: null }),
      makeJob({ id: 'b', seq: 2, barPair: parseBarPair('01/B1') }),
      makeJob({ id: 'a', seq: 1, barPair: parseBarPair('01/A1') }),
    ];
    expect(sortJobs(jobs, 'framePosition', 'asc').map((j) => j.id)).toEqual(['a', 'b', 'bad']);
  });

  it('keeps Unplaced at the end when sorting descending too', () => {
    const jobs = [
      makeJob({ id: 'bad', seq: 3, barPair: null }),
      makeJob({ id: 'b', seq: 2, barPair: parseBarPair('01/B1') }),
      makeJob({ id: 'a', seq: 1, barPair: parseBarPair('01/A1') }),
    ];
    // Descending reverses the placed jobs; Unplaced still must not lead.
    const ids = sortJobs(jobs, 'framePosition', 'desc').map((j) => j.id);
    expect(ids).toEqual(['bad', 'b', 'a']);
  });
});

describe('status transitions', () => {
  it('starts outstanding', () => {
    expect(deriveStatus(emptyProgress(NOW))).toBe('outstanding');
    expect(currentGate(emptyProgress(NOW))).toBe('activate');
  });

  it('walks outstanding -> activated -> tested -> completed', () => {
    let job = makeJob();

    let change = passGate(job, NOW, 'Engineer');
    job = { ...job, progress: change.progress, history: change.history };
    expect(deriveStatus(job.progress)).toBe('activated');
    expect(job.progress.activatedAt).toBe(NOW);

    change = passGate(job, NOW, 'Engineer');
    job = { ...job, progress: change.progress, history: change.history };
    expect(deriveStatus(job.progress)).toBe('tested');
    expect(job.progress.testedAt).toBe(NOW);

    change = passGate(job, NOW, 'Engineer');
    job = { ...job, progress: change.progress, history: change.history };
    expect(deriveStatus(job.progress)).toBe('completed');
    expect(job.progress.completedAt).toBe(NOW);
    expect(job.progress.completedBy).toBe('Engineer');

    // Nothing left to advance.
    expect(currentGate(job.progress)).toBeNull();
  });

  it('fails at the first gate and records the reason code', () => {
    const job = makeJob();
    const change = failGate(job, NOW, 'pair-already-in-use');
    expect(deriveStatus(change.progress)).toBe('failed');
    expect(change.progress.readyToActivate).toBe('failed');
    expect(change.progress.failReason).toBe('pair-already-in-use');
    // A failed activation has no activation timestamp.
    expect(change.progress.activatedAt).toBeNull();
  });

  it('fails at the test gate once activated', () => {
    let job = makeJob();
    const activated = passGate(job, NOW, null);
    job = { ...job, progress: activated.progress, history: activated.history };

    const change = failGate(job, NOW, 'no-dial-tone-after-move');
    expect(deriveStatus(change.progress)).toBe('failed');
    expect(change.progress.testStatus).toBe('fail');
    // The activation stands — only the test failed.
    expect(change.progress.readyToActivate).toBe('yes');
  });

  it('clears the fail reason when a previously failed gate passes', () => {
    let job = makeJob();
    const failed = failGate(job, NOW, 'access-blocked');
    job = { ...job, progress: failed.progress, history: failed.history };
    expect(job.progress.failReason).toBe('access-blocked');

    const passed = passGate(job, NOW, null);
    expect(passed.progress.failReason).toBeNull();
    expect(deriveStatus(passed.progress)).toBe('activated');
  });

  it('reverts one gate at a time, and reverting clears the timestamp', () => {
    let job = makeJob();
    for (let i = 0; i < 3; i += 1) {
      const change = passGate(job, NOW, 'Engineer');
      job = { ...job, progress: change.progress, history: change.history };
    }
    expect(deriveStatus(job.progress)).toBe('completed');

    let change = revertGate(job, NOW);
    job = { ...job, progress: change.progress, history: change.history };
    expect(deriveStatus(job.progress)).toBe('tested');
    expect(job.progress.completedAt).toBeNull();

    change = revertGate(job, NOW);
    job = { ...job, progress: change.progress, history: change.history };
    expect(deriveStatus(job.progress)).toBe('activated');
    expect(job.progress.testedAt).toBeNull();

    change = revertGate(job, NOW);
    job = { ...job, progress: change.progress, history: change.history };
    expect(deriveStatus(job.progress)).toBe('outstanding');
    expect(job.progress.activatedAt).toBeNull();
  });

  it('reverting an untouched job is a no-op', () => {
    const job = makeJob();
    const change = revertGate(job, NOW);
    expect(change.progress).toBe(job.progress);
    expect(deriveStatus(change.progress)).toBe('outstanding');
  });

  it('clearing a gate clears its timestamp', () => {
    let job = makeJob();
    const set = setGate(job, 'activate', 'yes', NOW, null);
    job = { ...job, progress: set.progress, history: set.history };
    expect(job.progress.activatedAt).toBe(NOW);

    const cleared = setGate(job, 'activate', null, NOW, null);
    expect(cleared.progress.readyToActivate).toBeNull();
    expect(cleared.progress.activatedAt).toBeNull();
  });

  it('records every change in the history', () => {
    let job = makeJob();
    const change = passGate(job, NOW, 'Engineer');
    job = { ...job, progress: change.progress, history: change.history };
    expect(job.history).toHaveLength(1);
    expect(job.history[0]).toMatchObject({ field: 'Ready to activate', from: null, to: 'yes' });
  });

  it('enforces the legal transition table', () => {
    expect(isLegalTransition('outstanding', 'activated')).toBe(true);
    expect(isLegalTransition('outstanding', 'failed')).toBe(true);
    expect(isLegalTransition('outstanding', 'completed')).toBe(false);
    expect(isLegalTransition('completed', 'outstanding')).toBe(false);
    expect(isLegalTransition('failed', 'activated')).toBe(true);
    expect(isLegalTransition('activated', 'activated')).toBe(true);
  });

  it('knows whether a job carries progress worth keeping on re-import', () => {
    expect(hasProgress(emptyProgress(NOW))).toBe(false);
    expect(hasProgress({ ...emptyProgress(NOW), notes: 'jumper missing' })).toBe(true);
    expect(hasProgress({ ...emptyProgress(NOW), readyToActivate: 'yes' })).toBe(true);
    expect(hasProgress({ ...emptyProgress(NOW), locked: true })).toBe(true);
  });
});

describe('search', () => {
  const headers = syntheticHeaders();
  const rows = syntheticRows({ rows: 20 });
  const mapping = detectRoles(headers);
  const { jobs } = buildJobs(rows, headers, mapping, NOW);

  it('matches a partial job number regardless of case and separators', () => {
    const target = jobs[0] as Job;
    const number = target.jobNumber;
    expect(matchesSearch(target, number)).toBe(true);
    expect(matchesSearch(target, number.toLowerCase())).toBe(true);
    expect(matchesSearch(target, number.replace('/', ' '))).toBe(true);
    expect(matchesSearch(target, number.replace('/', '-'))).toBe(true);
  });

  it('matches a circuit number with or without the leading zero', () => {
    const target = jobs[0] as Job;
    const circuit = target.source.Circuit as string;
    expect(circuit.startsWith('0')).toBe(true);
    expect(matchesSearch(target, circuit)).toBe(true);
    expect(matchesSearch(target, circuit.slice(1))).toBe(true);
  });

  it('matches a bar pair and notes', () => {
    const target = jobs[0] as Job;
    expect(matchesSearch(target, target.source['MDF BAR PAIR'] as string)).toBe(true);

    const withNote = { ...target, progress: { ...target.progress, notes: 'jumper missing', updatedAt: 'x' } };
    expect(matchesSearch(withNote, 'jumper')).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(jobs.every((job) => matchesSearch(job, ''))).toBe(true);
  });

  it('does not match an unrelated string', () => {
    expect(matchesSearch(jobs[0] as Job, 'zzzzznotpresent')).toBe(false);
  });
});

describe('filter counts and composition', () => {
  const headers = syntheticHeaders();
  const rows = syntheticRows({ rows: 442 });
  const mapping = detectRoles(headers);
  const { jobs } = buildJobs(rows, headers, mapping, NOW);

  it('counts all jobs as outstanding before any work', () => {
    const counts = countJobs(jobs, '');
    expect(counts.all).toBe(442);
    expect(counts.byStatus.outstanding).toBe(442);
    expect(counts.byStatus.completed).toBe(0);
    expect(counts.locked).toBe(0);
  });

  it('counts frames and job types', () => {
    const counts = countJobs(jobs, '');
    const frameTotal = Object.values(counts.byFrame).reduce((a, b) => a + b, 0);
    expect(frameTotal).toBe(442);
    expect(counts.byType['no-ties'] + counts.byType['ed-side'] + counts.byType.llu).toBe(442);
    expect(counts.byType.llu).toBe(3);
  });

  it('composes filter, search and sort', () => {
    const marked = jobs.map((job, i) =>
      i < 10 ? { ...job, progress: passGate(job, NOW, null).progress } : job,
    );

    const { jobs: result } = applyView(
      marked,
      { ...DEFAULT_VIEW, status: 'activated', sortField: 'jobNumber', sortDirection: 'desc' },
      'Old_Equipment',
    );

    expect(result).toHaveLength(10);
    // Descending job number.
    const numbers = result.map((j) => j.jobNumber);
    expect([...numbers].sort(naturalCompare).reverse()).toEqual(numbers);
  });

  it('reflects the search in the chip counts', () => {
    const target = jobs[0] as Job;
    const counts = countJobs(jobs, target.jobNumber);
    expect(counts.all).toBeGreaterThan(0);
    expect(counts.all).toBeLessThan(442);
  });
});

describe('grouping', () => {
  const headers = syntheticHeaders();
  const rows = syntheticRows({ rows: 442 });
  const mapping = detectRoles(headers);
  const { jobs } = buildJobs(rows, headers, mapping, NOW);

  it('groups by frame/block with done/total counts', () => {
    const sorted = sortJobs(jobs, 'framePosition', 'asc');
    const groups = groupJobs(sorted, 'block', 'Old_Equipment');

    expect(groups.length).toBeGreaterThan(1);
    expect(groups.reduce((sum, g) => sum + g.total, 0)).toBe(442);
    expect(groups.every((g) => g.done === 0)).toBe(true);
    // Unplaced (the bare-0 row) exists and is last in walk order.
    expect(groups.at(-1)?.key).toBe('Unplaced');
  });

  it('groups by old shelf', () => {
    const groups = groupJobs(jobs, 'oldShelf', 'Old_Equipment');
    expect(groups.reduce((sum, g) => sum + g.total, 0)).toBe(442);
    // Five shelves plus the one malformed value.
    expect(groups.length).toBeGreaterThanOrEqual(5);
  });

  it('extracts the shelf from an equipment reference', () => {
    const job = makeJob({ source: { Old_Equipment: '110.1234' } });
    expect(oldShelfOf(job, 'Old_Equipment')).toBe('110');
    expect(oldShelfOf(job, null)).toBe('Unknown shelf');
  });

  it('group "none" returns one bucket containing everything', () => {
    const groups = groupJobs(jobs, 'none', 'Old_Equipment');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.total).toBe(442);
  });
});

/**
 * Regressions from review of the detail screen's segmented controls. The list
 * buttons (passGate/failGate) were always correct; setGate was not.
 */
describe('setGate — regressions', () => {
  it('clears the fail reason once no gate is failed any more', () => {
    let job = makeJob();

    // Fail at activation, with a reason.
    const failed = failGate(job, NOW, 'wiring-damaged');
    job = { ...job, progress: failed.progress, history: failed.history };
    expect(job.progress.failReason).toBe('wiring-damaged');

    // Pass the test gate. The reason must stay — activation is still failed.
    const tested = setGate(job, 'test', 'pass', NOW, null);
    job = { ...job, progress: tested.progress, history: tested.history };
    expect(job.progress.failReason).toBe('wiring-damaged');

    // Now set activation to Yes. Nothing is failed, so the reason must go —
    // it used to survive, and went to the office in the export next to
    // "STATUS: Completed".
    const activated = setGate(job, 'activate', 'yes', NOW, null);
    expect(activated.progress.failReason).toBeNull();
    expect(deriveStatus(activated.progress)).toBe('tested');
  });

  it('clearing activation clears the gates that followed it', () => {
    let job = makeJob();
    for (let i = 0; i < 3; i += 1) {
      const change = passGate(job, NOW, 'Engineer');
      job = { ...job, progress: change.progress, history: change.history };
    }
    expect(deriveStatus(job.progress)).toBe('completed');

    // A job cannot be "not activated, test passed, completed".
    const cleared = setGate(job, 'activate', null, NOW, null);
    expect(cleared.progress.readyToActivate).toBeNull();
    expect(cleared.progress.activatedAt).toBeNull();
    expect(cleared.progress.testStatus).toBeNull();
    expect(cleared.progress.testedAt).toBeNull();
    expect(cleared.progress.completedAt).toBeNull();
    expect(deriveStatus(cleared.progress)).toBe('outstanding');
  });

  it('failing the test gate on a completed job clears the completion', () => {
    let job = makeJob();
    for (let i = 0; i < 3; i += 1) {
      const change = passGate(job, NOW, 'Engineer');
      job = { ...job, progress: change.progress, history: change.history };
    }

    // Otherwise the export reads "TEST STATUS: Fail" beside a completion
    // timestamp, with STATUS: Failed — three columns disagreeing.
    const failedTest = setGate(job, 'test', 'fail', NOW, null);
    expect(failedTest.progress.completedAt).toBeNull();
    expect(failedTest.progress.completedBy).toBeNull();
    expect(deriveStatus(failedTest.progress)).toBe('failed');
  });

  it('a completed job never exports a timestamp that contradicts its status', () => {
    let job = makeJob();
    const activated = setGate(job, 'activate', 'yes', NOW, null);
    job = { ...job, progress: activated.progress, history: activated.history };
    const done = setGate(job, 'complete', 'done', NOW, 'Engineer');
    job = { ...job, progress: done.progress, history: done.history };

    // Completion without a test result is allowed (he may not have tested),
    // but the status must agree with the timestamps that are set.
    expect(deriveStatus(job.progress)).toBe('completed');
    expect(job.progress.completedAt).toBe(NOW);
    expect(job.progress.activatedAt).toBe(NOW);
  });
});
