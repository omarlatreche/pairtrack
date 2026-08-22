/**
 * Sort, filter, group and search — BRIEF §7.4 / §7.5.
 *
 * Pure functions over a job array. Filter + sort + search compose, and the
 * combination is what gets persisted and restored on relaunch.
 */
import { compareBarPair, blockKey } from './barPair';
import { naturalCompare, normaliseForSearch } from './naturalSort';
import { deriveStatus, STATUS_RANK } from './transitions';
import type {
  GroupMode,
  Job,
  JobStatus,
  JobType,
  SortDirection,
  SortField,
  ViewSpec,
} from './types';

export const JOB_TYPE_LABELS: Record<JobType, string> = {
  'no-ties': 'No ties',
  'ed-side': 'E/D-side',
  llu: 'LLU',
};

/** Sort rank for job type — shortest work first, so it reads as effort. */
const JOB_TYPE_RANK: Record<JobType, number> = { 'no-ties': 0, 'ed-side': 1, llu: 2 };

// --- Search -----------------------------------------------------------------

/**
 * The searchable text for a job, pre-normalised.
 *
 * Includes every source column plus notes, so searching by circuit number
 * works — that is how the office identifies a job to him over the phone, so it
 * has to work first time (BRIEF §7.5).
 */
export function searchIndexFor(job: Job): string {
  const parts: string[] = [job.jobNumber, String(job.seq)];
  for (const value of Object.values(job.source)) parts.push(value);
  if (job.progress.notes) parts.push(job.progress.notes);
  if (job.progress.vert) parts.push(job.progress.vert);
  if (job.progress.up) parts.push(job.progress.up);
  if (job.progress.completedBy) parts.push(job.progress.completedBy);
  return normaliseForSearch(parts.join(' '));
}

const searchCache = new WeakMap<Job, { updatedAt: string; index: string }>();

function cachedSearchIndex(job: Job): string {
  const cached = searchCache.get(job);
  if (cached && cached.updatedAt === job.progress.updatedAt) return cached.index;
  const index = searchIndexFor(job);
  searchCache.set(job, { updatedAt: job.progress.updatedAt, index });
  return index;
}

export function matchesSearch(job: Job, query: string): boolean {
  const needle = normaliseForSearch(query);
  if (needle === '') return true;

  const haystack = cachedSearchIndex(job);
  if (haystack.includes(needle)) return true;

  // A circuit number must match whether or not he types the leading 0
  // (BRIEF §7.5). Only worth trying for an all-digit query.
  if (/^\d+$/.test(needle)) {
    if (haystack.includes(`0${needle}`)) return true;
    if (needle.startsWith('0') && haystack.includes(needle.slice(1))) return true;
  }

  return false;
}

// --- Filter -----------------------------------------------------------------

export function matchesFilters(job: Job, view: ViewSpec): boolean {
  const status = deriveStatus(job.progress);

  switch (view.status) {
    case 'all':
      break;
    case 'locked':
      if (!job.progress.locked) return false;
      break;
    case 'attention':
      if (job.defects.length === 0) return false;
      break;
    default:
      if (status !== view.status) return false;
  }

  if (view.jobType !== null && job.jobType !== view.jobType) return false;
  if (view.frame !== null && (job.barPair?.frame ?? 'Unplaced') !== view.frame) return false;

  return true;
}

// --- Sort -------------------------------------------------------------------

export const SORT_FIELD_LABELS: Record<string, string> = {
  framePosition: 'Frame walk order',
  jobNumber: 'Job number',
  seq: 'Sheet order',
  status: 'Status',
  updatedAt: 'Last updated',
  jobType: 'Job type',
};

export function sortFieldLabel(field: SortField): string {
  if (field.startsWith('source:')) return field.slice('source:'.length);
  return SORT_FIELD_LABELS[field] ?? field;
}

function compareJobs(a: Job, b: Job, field: SortField): number {
  switch (field) {
    case 'framePosition':
      return compareBarPair(a.barPair, b.barPair);

    case 'jobNumber':
      return naturalCompare(a.jobNumber, b.jobNumber);

    case 'seq':
      return a.seq - b.seq;

    case 'status':
      return STATUS_RANK[deriveStatus(a.progress)] - STATUS_RANK[deriveStatus(b.progress)];

    case 'jobType':
      return JOB_TYPE_RANK[a.jobType] - JOB_TYPE_RANK[b.jobType];

    case 'updatedAt':
      return a.progress.updatedAt.localeCompare(b.progress.updatedAt);

    default: {
      const key = field.slice('source:'.length);
      return naturalCompare(a.source[key] ?? '', b.source[key] ?? '');
    }
  }
}

export function sortJobs(jobs: Job[], field: SortField, direction: SortDirection): Job[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...jobs].sort((a, b) => {
    const primary = compareJobs(a, b, field);
    if (primary !== 0) return primary * factor;
    // Sheet order is the tiebreak, so the list is always totally ordered and
    // never reshuffles under him when two jobs compare equal.
    return a.seq - b.seq;
  });
}

// --- Grouping ---------------------------------------------------------------

export interface JobGroup {
  readonly key: string;
  readonly label: string;
  readonly jobs: Job[];
  readonly done: number;
  readonly total: number;
}

/** The old-equipment shelf, i.e. everything before the port segment. */
export function oldShelfOf(job: Job, oldEquipmentColumn: string | null): string {
  if (oldEquipmentColumn === null) return 'Unknown shelf';
  const raw = job.source[oldEquipmentColumn] ?? '';
  const shelf = raw.split('.')[0]?.trim();
  return shelf && shelf !== '' ? shelf : 'Unknown shelf';
}

export function groupJobs(
  jobs: Job[],
  mode: GroupMode,
  oldEquipmentColumn: string | null,
): JobGroup[] {
  if (mode === 'none') {
    return [
      {
        key: 'all',
        label: '',
        jobs,
        done: jobs.filter((j) => deriveStatus(j.progress) === 'completed').length,
        total: jobs.length,
      },
    ];
  }

  const buckets = new Map<string, Job[]>();

  for (const job of jobs) {
    let key: string;
    if (mode === 'block') key = blockKey(job.barPair);
    else if (mode === 'oldShelf') key = oldShelfOf(job, oldEquipmentColumn);
    else key = deriveStatus(job.progress);

    const bucket = buckets.get(key);
    if (bucket) bucket.push(job);
    else buckets.set(key, [job]);
  }

  // Preserve the order the sorted array produced — the groups then follow the
  // same walk order the jobs do.
  return [...buckets.entries()].map(([key, groupJobsList]) => ({
    key,
    label: key,
    jobs: groupJobsList,
    done: groupJobsList.filter((j) => deriveStatus(j.progress) === 'completed').length,
    total: groupJobsList.length,
  }));
}

// --- The whole pipeline -----------------------------------------------------

export function applyView(
  jobs: Job[],
  view: ViewSpec,
  oldEquipmentColumn: string | null,
): { jobs: Job[]; groups: JobGroup[] } {
  const filtered = jobs.filter((job) => matchesFilters(job, view) && matchesSearch(job, view.search));
  const sorted = sortJobs(filtered, view.sortField, view.sortDirection);
  return { jobs: sorted, groups: groupJobs(sorted, view.group, oldEquipmentColumn) };
}

// --- Counts for the filter chips (BRIEF §7.5) -------------------------------

export interface FilterCounts {
  readonly all: number;
  readonly byStatus: Record<JobStatus, number>;
  readonly locked: number;
  readonly attention: number;
  readonly byType: Record<JobType, number>;
  readonly byFrame: Record<string, number>;
}

/**
 * Counts respect the search box but not the status chips themselves — a chip
 * showing "Completed (0)" while Completed is selected would be nonsense.
 */
export function countJobs(jobs: Job[], search: string): FilterCounts {
  const byStatus: Record<JobStatus, number> = {
    outstanding: 0,
    activated: 0,
    tested: 0,
    completed: 0,
    failed: 0,
  };
  const byType: Record<JobType, number> = { 'no-ties': 0, 'ed-side': 0, llu: 0 };
  const byFrame: Record<string, number> = {};
  let locked = 0;
  let attention = 0;
  let all = 0;

  for (const job of jobs) {
    if (!matchesSearch(job, search)) continue;
    all += 1;
    byStatus[deriveStatus(job.progress)] += 1;
    byType[job.jobType] += 1;
    const frame = job.barPair?.frame ?? 'Unplaced';
    byFrame[frame] = (byFrame[frame] ?? 0) + 1;
    if (job.progress.locked) locked += 1;
    if (job.defects.length > 0) attention += 1;
  }

  return { all, byStatus, locked, attention, byType, byFrame };
}
