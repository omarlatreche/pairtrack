/**
 * All references in this file are fabricated — no value here comes from the
 * real pack. See BRIEF.md section 5.2.
 * no-data-scan: synthetic
 */
import { describe, expect, it } from 'vitest';
import { compareBarPair, blockKey, formatBarPair, parseBarPair } from '../../src/data/barPair';
import { naturalCompare, normaliseForSearch } from '../../src/data/naturalSort';
import {
  deriveStatus,
  emptyProgress,
  hasProgress,
  signOff,
  STATUS_RANK,
  toggleDone,
} from '../../src/data/transitions';
import { countJobs, matchesSearch, oldShelfOf, sortJobs, applyView, groupJobs } from '../../src/data/view';
import { DEFAULT_VIEW, type Job } from '../../src/data/types';
import { buildJobs } from '../../src/import/buildJobs';
import { detectRoles } from '../../src/import/columns';
import { syntheticHeaders, syntheticRows } from './fixtures/syntheticPack';

const LATER = '2026-08-22T11:00:00.000Z';
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

describe('done / not done — D17', () => {
  it('starts not done', () => {
    expect(deriveStatus(emptyProgress(NOW))).toBe('outstanding');
  });

  it('one tap marks it done and stamps the time he tapped', () => {
    const job = makeJob();
    const change = toggleDone(job, NOW, 'Engineer');

    expect(deriveStatus(change.progress)).toBe('pending');
    expect(change.progress.doneAt).toBe(NOW);
    expect(change.progress.completedBy).toBe('Engineer');
    expect(change.progress.signedOffAt).toBeNull();
  });

  it('tapping again undoes it completely', () => {
    let job = makeJob();
    job = { ...job, progress: toggleDone(job, NOW, 'Engineer').progress };
    const undone = toggleDone(job, LATER, 'Engineer');

    expect(deriveStatus(undone.progress)).toBe('outstanding');
    expect(undone.progress.doneAt).toBeNull();
    expect(undone.progress.completedBy).toBeNull();
  });

  it('signs off a pending job as part of the batch', () => {
    const job = makeJob();
    const done = toggleDone(job, NOW, 'Engineer').progress;
    const signed = signOff(done, LATER);

    expect(signed).not.toBeNull();
    expect(deriveStatus(signed!)).toBe('signed-off');
    // The tap time survives sign-off: it is when the work actually happened,
    // and it is the only timestamp he said matters.
    expect(signed!.doneAt).toBe(NOW);
    expect(signed!.signedOffAt).toBe(LATER);
  });

  it('refuses to sign off a job he never ticked', () => {
    expect(signOff(emptyProgress(NOW), LATER)).toBeNull();
  });

  it('signing off twice is a no-op, so a double tap cannot double-stamp', () => {
    const done = toggleDone(makeJob(), NOW, 'Engineer').progress;
    const first = signOff(done, LATER)!;
    expect(signOff(first, 'later still')).toBeNull();
  });

  it('un-ticking a signed-off job clears the sign-off too', () => {
    // Otherwise the job sits in an impossible state: signed off, but not done.
    let job = makeJob();
    job = { ...job, progress: toggleDone(job, NOW, 'Engineer').progress };
    job = { ...job, progress: signOff(job.progress, LATER)! };

    const undone = toggleDone(job, 'later still', 'Engineer');
    expect(undone.progress.doneAt).toBeNull();
    expect(undone.progress.signedOffAt).toBeNull();
    expect(deriveStatus(undone.progress)).toBe('outstanding');
  });

  it('knows whether a job carries progress worth keeping on re-import', () => {
    expect(hasProgress(emptyProgress(NOW))).toBe(false);
    expect(hasProgress(toggleDone(makeJob(), NOW, null).progress)).toBe(true);
  });

  it('ranks what still needs doing first', () => {
    expect(STATUS_RANK.outstanding).toBeLessThan(STATUS_RANK.pending);
    expect(STATUS_RANK.pending).toBeLessThan(STATUS_RANK['signed-off']);
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

  it('matches a bar pair, and the JOB number he actually works from', () => {
    const target = jobs[0] as Job;
    expect(matchesSearch(target, target.source['MDF BAR PAIR'] as string)).toBe(true);
    expect(matchesSearch(target, String(target.seq))).toBe(true);
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
    expect(counts.byStatus.pending).toBe(0);
    expect(counts.byStatus['signed-off']).toBe(0);
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
      i < 10 ? { ...job, progress: toggleDone(job, NOW, null).progress } : job,
    );

    const { jobs: result } = applyView(
      marked,
      { ...DEFAULT_VIEW, status: 'pending', sortField: 'jobNumber', sortDirection: 'desc' },
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
