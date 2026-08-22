/**
 * Turn parsed rows into Jobs — BRIEF §7.8.
 *
 * Derives job type, parses the bar pair, flags defects. The governing rule:
 * **a malformed row must import.** Flag it, badge it, let him correct it in the
 * app. Never drop a row, never crash — the office will still ask him about the
 * job whether or not the spreadsheet was well-formed.
 */
import { parseBarPair } from '../data/barPair';
import { emptyProgress } from '../data/transitions';
import type { ColumnRole, DefectCode, Job, JobType } from '../data/types';
import { headerForRole } from './columns';

/**
 * Derive job type from the tie columns — SCHEMA.md.
 *
 * In the real pack: 217 no-ties, 222 E/D-side, 3 LLU. Not a column, so it has
 * to be derived per row; it does not correlate with job-number prefix or shelf.
 */
export function deriveJobType(esideTies: string, dsideTies: string): JobType {
  const eside = esideTies.trim();
  const dside = dsideTies.trim();

  if (eside === '' && dside === '') return 'no-ties';

  // LLU ties use a distinct format: `#LLUA###### ##### I` in, `LLUA###### ##### O` out.
  if (/LLU/i.test(eside) || /LLU/i.test(dside)) return 'llu';

  return 'ed-side';
}

/**
 * Equipment references are `###.####` — shelf, dot, port.
 *
 * One row in the real pack is `########.` with the port segment lost: the shelf
 * and port ran together. Flagged, not rejected.
 */
export function isMalformedEquipment(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (!trimmed.includes('.')) return true;
  const [shelf, port] = trimmed.split('.');
  return !shelf || shelf.trim() === '' || !port || port.trim() === '';
}

/**
 * Stable id derived from the job number — the merge key on re-import.
 *
 * A plain normalised string, not a hash: it has to be stable across app
 * versions, and a synchronous non-crypto derivation keeps the importer simple.
 * Uniqueness comes from the job number itself, which SCHEMA.md confirms is
 * unique across the pack.
 */
export function jobIdFor(jobNumber: string): string {
  return jobNumber.trim().toUpperCase().replace(/\s+/g, '');
}

export interface BuildResult {
  readonly jobs: Job[];
  /** Counts by defect, for the import summary. */
  readonly defectCounts: Record<DefectCode, number>;
  readonly typeCounts: Record<JobType, number>;
}

export function buildJobs(
  rows: Array<Record<string, string>>,
  headers: string[],
  mapping: Record<string, ColumnRole | null>,
  now: string,
): BuildResult {
  const jobNumberCol = headerForRole(mapping, 'jobNumber');
  const barPairCol = headerForRole(mapping, 'barPair');
  const esideCol = headerForRole(mapping, 'esideTies');
  const dsideCol = headerForRole(mapping, 'dsideTies');
  const oldEquipCol = headerForRole(mapping, 'oldEquipment');
  const seqCol = headerForRole(mapping, 'seq');

  const jobs: Job[] = [];
  const defectCounts: Record<DefectCode, number> = {
    'bad-barpair': 0,
    'bad-old-equipment': 0,
    'missing-job-number': 0,
    'duplicate-job-number': 0,
  };
  const typeCounts: Record<JobType, number> = { 'no-ties': 0, 'ed-side': 0, llu: 0 };
  const seenIds = new Set<string>();

  rows.forEach((row, index) => {
    const defects: DefectCode[] = [];

    // Source is every column verbatim, in sheet order, so export round-trips.
    const source: Record<string, string> = {};
    for (const header of headers) source[header] = row[header] ?? '';

    const rawJobNumber = jobNumberCol !== null ? (row[jobNumberCol] ?? '').trim() : '';

    // A row with no job number still imports — it is given a positional
    // identity and flagged, because dropping it loses work he may have to do.
    let jobNumber = rawJobNumber;
    if (jobNumber === '') {
      jobNumber = `ROW-${index + 1}`;
      defects.push('missing-job-number');
    }

    let id = jobIdFor(jobNumber);
    if (seenIds.has(id)) {
      defects.push('duplicate-job-number');
      id = `${id}#${index + 1}`;
    }
    seenIds.add(id);

    const rawBarPair = barPairCol !== null ? (row[barPairCol] ?? '') : '';
    const barPair = parseBarPair(rawBarPair);
    if (barPairCol !== null && rawBarPair.trim() !== '' && barPair === null) {
      // The real pack's last row holds a bare `0`. It sorts into Unplaced.
      defects.push('bad-barpair');
    }

    const oldEquip = oldEquipCol !== null ? (row[oldEquipCol] ?? '') : '';
    if (isMalformedEquipment(oldEquip)) defects.push('bad-old-equipment');

    const jobType = deriveJobType(
      esideCol !== null ? (row[esideCol] ?? '') : '',
      dsideCol !== null ? (row[dsideCol] ?? '') : '',
    );

    const rawSeq = seqCol !== null ? (row[seqCol] ?? '') : '';
    const parsedSeq = Number.parseInt(rawSeq, 10);
    const seq = Number.isFinite(parsedSeq) ? parsedSeq : index + 1;

    for (const defect of defects) defectCounts[defect] += 1;
    typeCounts[jobType] += 1;

    jobs.push({
      id,
      source,
      seq,
      jobNumber,
      barPair,
      jobType,
      defects,
      progress: emptyProgress(now),
      history: [],
      missingSince: null,
    });
  });

  return { jobs, defectCounts, typeCounts };
}
