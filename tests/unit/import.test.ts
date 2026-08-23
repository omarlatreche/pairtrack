/**
 * All references in this file are fabricated — no value here comes from the
 * real pack. See BRIEF.md section 5.2.
 * no-data-scan: synthetic
 */
import { describe, expect, it } from 'vitest';
import { cleanCell, parseWorkbook } from '../../src/import/parse';
import { buildJobs, deriveJobType, isMalformedEquipment, jobIdFor } from '../../src/import/buildJobs';
import { detectConstantColumns, detectRole, detectRoles, headerForRole } from '../../src/import/columns';
import { describeMerge, mergeJobs, packNameFromFile, previewMerge } from '../../src/import/merge';
import { emptyProgress, toggleDone } from '../../src/data/transitions';
import type { Job } from '../../src/data/types';
import { syntheticHeaders, syntheticRows, syntheticWorkbookBytes } from './fixtures/syntheticPack';

const NOW = '2026-08-22T10:33:00.000Z';

describe('cell cleaning', () => {
  it('strips a literal leading apostrophe from equipment values', () => {
    // SCHEMA.md: the apostrophe is in the cell value, not an Excel quote-prefix
    // flag, so nothing upstream removes it for us.
    expect(cleanCell("'250.1234")).toBe('250.1234');
    expect(cleanCell("'8.4021")).toBe('8.4021');
  });

  it('strips only one apostrophe and leaves the rest verbatim', () => {
    expect(cleanCell("''double")).toBe("'double");
  });

  it('trims the ends but preserves internal spaces (LLU tie format)', () => {
    expect(cleanCell('  0LLUB100007 20007 I  ')).toBe('0LLUB100007 20007 I');
  });

  it('handles null, undefined and numbers', () => {
    expect(cleanCell(null)).toBe('');
    expect(cleanCell(undefined)).toBe('');
    expect(cleanCell(442)).toBe('442');
  });
});

describe('column role detection', () => {
  it('detects every role in the real header set', () => {
    const mapping = detectRoles(syntheticHeaders());
    expect(mapping['Job Number']).toBe('jobNumber');
    expect(mapping['MDF BAR PAIR']).toBe('barPair');
    expect(mapping['ESIDE TIES']).toBe('esideTies');
    expect(mapping['DSIDE TIES']).toBe('dsideTies');
    expect(mapping['New_Equipment']).toBe('newEquipment');
    expect(mapping['Old_Equipment']).toBe('oldEquipment');
    expect(mapping['Circuit']).toBe('circuit');
    expect(mapping['JOB']).toBe('seq');
    // DB is not a known role but is kept.
    expect(mapping['DB']).toBe('other');
  });

  it('is tolerant of header wording it has not seen', () => {
    expect(detectRole('Job No.')).toBe('jobNumber');
    expect(detectRole('mdf bar pair')).toBe('barPair');
    expect(detectRole('E-Side Ties')).toBe('esideTies');
    expect(detectRole('Telephone Number')).toBe('circuit');
    expect(detectRole('Something Unknown')).toBe('other');
  });

  it('never assigns the same role twice', () => {
    const mapping = detectRoles(['Job Number', 'Job Ref', 'MDF BAR PAIR']);
    const jobNumberColumns = Object.values(mapping).filter((r) => r === 'jobNumber');
    expect(jobNumberColumns).toHaveLength(1);
    expect(mapping['Job Ref']).toBe('other');
  });

  it('finds the header for a role', () => {
    const mapping = detectRoles(syntheticHeaders());
    expect(headerForRole(mapping, 'jobNumber')).toBe('Job Number');
    expect(headerForRole(mapping, 'seq')).toBe('JOB');
  });
});

describe('constant column detection', () => {
  it('detects a column with cardinality 1 without hard-coding its name', () => {
    const headers = syntheticHeaders();
    const rows = syntheticRows({ rows: 50 });
    const constants = detectConstantColumns(rows, headers);

    // DB is constant across the whole pack in the real file.
    expect(constants['DB']).toBe('LW');
    // Job Number and Circuit vary, so must not be flagged.
    expect(constants['Job Number']).toBeUndefined();
    expect(constants['Circuit']).toBeUndefined();
  });

  it('does not flag a constant column when there is only one row to compare', () => {
    const headers = syntheticHeaders();
    expect(detectConstantColumns(syntheticRows({ rows: 1 }), headers)).toEqual({});
  });
});

describe('job type derivation', () => {
  it('derives no-ties when both tie columns are empty', () => {
    expect(deriveJobType('', '')).toBe('no-ties');
    expect(deriveJobType('   ', '  ')).toBe('no-ties');
  });

  it('derives ed-side when the tie columns are populated', () => {
    expect(deriveJobType('02-E-100-U01-001', '4-D-200-U01-001')).toBe('ed-side');
  });

  it('derives llu from the LLU tie format', () => {
    expect(deriveJobType('0LLUB100007 20007 I', 'LLUB100007 20007 O')).toBe('llu');
  });

  it('derives the three types across a full synthetic pack', () => {
    const headers = syntheticHeaders();
    const rows = syntheticRows({ rows: 442 });
    const { typeCounts } = buildJobs(rows, headers, detectRoles(headers), NOW);

    // The real pack is 217 / 222 / 3. The fixture mirrors the shape: exactly
    // three LLU rows, and the rest split by whether the tie columns are filled.
    expect(typeCounts.llu).toBe(3);
    expect(typeCounts['no-ties'] + typeCounts['ed-side'] + typeCounts.llu).toBe(442);
    expect(typeCounts['no-ties']).toBeGreaterThan(200);
    expect(typeCounts['ed-side']).toBeGreaterThan(200);
  });
});

describe('malformed data — handled, never dropped', () => {
  const headers = syntheticHeaders();
  const rows = syntheticRows({ rows: 442, withDefects: true });
  const result = buildJobs(rows, headers, detectRoles(headers), NOW);

  it('imports all 442 rows even with two defective ones', () => {
    expect(result.jobs).toHaveLength(442);
  });

  it('flags the bare-0 bar pair rather than crashing', () => {
    const flagged = result.jobs.filter((job) => job.defects.includes('bad-barpair'));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.barPair).toBeNull();
    // The row is still there, with its source intact.
    expect(flagged[0]?.source['MDF BAR PAIR']).toBe('0');
  });

  it('flags the malformed equipment reference', () => {
    const flagged = result.jobs.filter((job) => job.defects.includes('bad-old-equipment'));
    expect(flagged).toHaveLength(1);
    expect(result.defectCounts['bad-old-equipment']).toBe(1);
  });

  it('recognises the malformed equipment pattern in isolation', () => {
    expect(isMalformedEquipment('1101042.')).toBe(true); // port segment lost
    expect(isMalformedEquipment('110.1042')).toBe(false);
    expect(isMalformedEquipment('8.4021')).toBe(false);
    expect(isMalformedEquipment('')).toBe(false); // empty is absent, not malformed
    expect(isMalformedEquipment('nodot')).toBe(true);
  });

  it('gives a row with no job number a positional identity and a flag', () => {
    const headersLocal = syntheticHeaders();
    const rowsLocal = syntheticRows({ rows: 3 });
    (rowsLocal[1] as Record<string, string>)['Job Number'] = '';

    const built = buildJobs(rowsLocal, headersLocal, detectRoles(headersLocal), NOW);
    expect(built.jobs).toHaveLength(3);
    expect(built.jobs[1]?.defects).toContain('missing-job-number');
    expect(built.jobs[1]?.jobNumber).toBe('ROW-2');
  });

  it('keeps both rows when a job number is duplicated', () => {
    const headersLocal = syntheticHeaders();
    const rowsLocal = syntheticRows({ rows: 3 });
    const duplicate = rowsLocal[0]?.['Job Number'] as string;
    (rowsLocal[1] as Record<string, string>)['Job Number'] = duplicate;

    const built = buildJobs(rowsLocal, headersLocal, detectRoles(headersLocal), NOW);
    expect(built.jobs).toHaveLength(3);
    expect(built.jobs[1]?.defects).toContain('duplicate-job-number');
    expect(new Set(built.jobs.map((j) => j.id)).size).toBe(3);
  });
});

describe('imported values', () => {
  const headers = syntheticHeaders();
  const rows = syntheticRows({ rows: 20 });
  const { jobs } = buildJobs(rows, headers, detectRoles(headers), NOW);

  it('preserves all source columns in sheet order for a clean export round-trip', () => {
    expect(Object.keys(jobs[0]?.source ?? {})).toEqual(headers);
  });

  it('keeps the leading zero on a circuit number', () => {
    for (const job of jobs) {
      expect(job.source.Circuit?.startsWith('0')).toBe(true);
      expect(job.source.Circuit).toHaveLength(11);
    }
  });

  it('parses the JOB column as the sequence number', () => {
    expect(jobs[0]?.seq).toBe(1);
    expect(jobs[19]?.seq).toBe(20);
  });

  it('derives a stable id from the job number', () => {
    expect(jobIdFor(' qqa123/4 ')).toBe('QQA123/4');
    expect(jobIdFor('QQA123/4')).toBe(jobIdFor('qqa123/4'));
  });

  it('starts every job outstanding with empty progress', () => {
    expect(jobs.every((job) => job.progress.doneAt === null)).toBe(true);
    expect(jobs.every((job) => job.history.length === 0)).toBe(true);
  });
});

describe('xlsx parsing', () => {
  it('reads a real workbook and returns the nine headed columns', async () => {
    const bytes = await syntheticWorkbookBytes({ rows: 30 });
    const parsed = await parseWorkbook(bytes);

    expect(parsed.rows).toHaveLength(30);
    expect(parsed.headers).toEqual([...syntheticHeaders()]);
  });

  it('ignores empty-but-formatted trailing columns (J-N in the real file)', async () => {
    const bytes = await syntheticWorkbookBytes({ rows: 10, withPhantomColumns: true });
    const parsed = await parseWorkbook(bytes);

    // A naive reader sees 14 columns. Only the nine headed ones are real.
    expect(parsed.headers).toHaveLength(9);
    expect(parsed.headers).toEqual([...syntheticHeaders()]);
  });

  it('strips leading apostrophes from equipment values on the way through', async () => {
    const bytes = await syntheticWorkbookBytes({ rows: 5, withLeadingApostrophes: true });
    const parsed = await parseWorkbook(bytes);

    for (const row of parsed.rows) {
      expect(row.New_Equipment?.startsWith("'")).toBe(false);
      expect(row.Old_Equipment?.startsWith("'")).toBe(false);
      expect(row.New_Equipment).toMatch(/^\d+\./);
    }
  });

  it('keeps circuit numbers as text with the leading zero intact', async () => {
    const bytes = await syntheticWorkbookBytes({ rows: 5 });
    const parsed = await parseWorkbook(bytes);

    for (const row of parsed.rows) {
      expect(row.Circuit).toMatch(/^0\d{10}$/);
    }
  });

  it('rejects a workbook with no job rows, with a message he can act on', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([[...syntheticHeaders()]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Empty');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    await expect(parseWorkbook(bytes)).rejects.toThrow(/no job rows/i);
  });
});

describe('merge on re-import', () => {
  const headers = syntheticHeaders();
  const mapping = detectRoles(headers);

  function build(rowCount: number): Job[] {
    return buildJobs(syntheticRows({ rows: rowCount }), headers, mapping, NOW).jobs;
  }

  it('keeps progress on matched jobs', () => {
    const existing = build(20).map((job, i) =>
      i < 5 ? { ...job, progress: toggleDone(job, NOW, 'Engineer').progress } : job,
    );
    const incoming = build(20);

    const merged = mergeJobs(existing, incoming, NOW);

    expect(merged).toHaveLength(20);
    expect(merged.slice(0, 5).every((job) => job.progress.doneAt === NOW)).toBe(true);
    expect(merged.slice(0, 5).every((job) => job.progress.completedBy === 'Engineer')).toBe(true);
  });

  it('refreshes source columns while leaving progress alone', () => {
    const existing = build(5).map((job) => ({
      ...job,
      progress: toggleDone(job, NOW, 'Engineer').progress,
    }));

    const incoming = build(5).map((job) => ({
      ...job,
      source: { ...job.source, DB: 'ZZ' }, // the office changed a source value
    }));

    const merged = mergeJobs(existing, incoming, NOW);
    expect(merged[0]?.source.DB).toBe('ZZ');
    expect(merged[0]?.progress.completedBy).toBe('Engineer');
    expect(merged[0]?.progress.doneAt).toBe(NOW);
  });

  it('flags a job missing from the new pack instead of deleting it', () => {
    const existing = build(20);
    const incoming = build(15);

    const merged = mergeJobs(existing, incoming, NOW);

    expect(merged).toHaveLength(20);
    const flagged = merged.filter((job) => job.missingSince === NOW);
    expect(flagged).toHaveLength(5);
  });

  it('previews the merge before anything is committed', () => {
    const existing = build(20).map((job, i) =>
      i < 7 ? { ...job, progress: toggleDone(job, NOW, null).progress } : job,
    );
    const incoming = build(22);

    const preview = previewMerge(existing, incoming);
    expect(preview).toMatchObject({ total: 22, added: 2, matched: 20, missing: 0, progressKept: 7 });

    const text = describeMerge(preview);
    expect(text).toContain('22 jobs');
    expect(text).toContain('2 new');
    expect(text).toContain('20 matched');
    expect(text).toContain('Progress on 7 jobs will be kept');
  });

  it('a first import matches nothing and adds everything', () => {
    const preview = previewMerge([], build(442));
    expect(preview).toMatchObject({ total: 442, added: 442, matched: 0, missing: 0, progressKept: 0 });
  });

  it('re-importing an identical pack changes nothing', () => {
    const existing = build(10);
    const preview = previewMerge(existing, build(10));
    expect(preview).toMatchObject({ added: 0, matched: 10, missing: 0 });
  });

  it('derives a readable pack name from a filename', () => {
    expect(packNameFromFile('1234567-Exchange - EXAMPLE 100000 VC.xlsx')).toBe(
      '1234567-Exchange - EXAMPLE 100000 VC',
    );
    expect(packNameFromFile('some_pack_name.xlsm')).toBe('some pack name');
  });
});

describe('progress is untouched by a source refresh', () => {
  it('every progress field survives a merge', () => {
    const headers = syntheticHeaders();
    const mapping = detectRoles(headers);
    const [job] = buildJobs(syntheticRows({ rows: 1 }), headers, mapping, NOW).jobs;

    const worked: Job = {
      ...(job as Job),
      progress: {
        ...emptyProgress(NOW),
        doneAt: NOW,
        completedBy: 'Engineer',
        updatedAt: NOW,
      },
      history: [{ at: NOW, field: 'Done', from: null, to: NOW }],
    };

    const incoming = buildJobs(syntheticRows({ rows: 1 }), headers, mapping, NOW).jobs;
    const merged = mergeJobs([worked], incoming, NOW);

    expect(merged[0]?.progress).toEqual(worked.progress);
    expect(merged[0]?.history).toEqual(worked.history);
  });
});

/**
 * Regressions from review. Each of these passed silently before the fix, which
 * is exactly what made them dangerous.
 */
describe('header handling — regressions', () => {
  it('a header with a trailing space does not empty its column', async () => {
    // The pack is generated by Power Query, where a header inheriting a stray
    // space from upstream is routine. Reading cells by header NAME (after
    // trimming the name) returned undefined for every row, so the column went
    // silently empty on all 442 rows — and if it landed on Circuit, that is
    // 442 telephone numbers gone with no warning.
    const bytes = await syntheticWorkbookBytes({ rows: 10, headerWithTrailingSpace: 'Circuit' });
    const parsed = await parseWorkbook(bytes);

    expect(parsed.headers).toContain('Circuit');
    for (const row of parsed.rows) {
      expect(row.Circuit).toMatch(/^0\d{10}$/);
    }
  });

  it('a trailing space on the key column does not destroy the natural key', async () => {
    const bytes = await syntheticWorkbookBytes({
      rows: 10,
      headerWithTrailingSpace: 'Job Number',
    });
    const parsed = await parseWorkbook(bytes);
    const mapping = detectRoles(parsed.headers);
    const { jobs } = buildJobs(parsed.rows, parsed.headers, mapping, NOW);

    expect(jobs.every((job) => !job.jobNumber.startsWith('ROW-'))).toBe(true);
    expect(jobs.every((job) => !job.defects.includes('missing-job-number'))).toBe(true);
  });

  it('a repeated header keeps both columns instead of collapsing them', async () => {
    const bytes = await syntheticWorkbookBytes({ rows: 5, duplicateHeader: 'DB' });
    const parsed = await parseWorkbook(bytes);

    // Both survive, the second disambiguated so it can be a distinct key.
    expect(parsed.headers.filter((h) => h.startsWith('DB'))).toEqual(['DB', 'DB (2)']);
    expect(Object.keys(parsed.rows[0] ?? {})).toHaveLength(parsed.headers.length);
  });
});
