/**
 * The data model — BRIEF §5.
 *
 * The one structural rule: `source` is imported truth and is never mutated;
 * `progress` belongs to the app. Keeping them in separate objects is what lets
 * next week's pack refresh the source data without touching a single tick.
 */

export type JobType = 'no-ties' | 'ed-side' | 'llu';

export type JobStatus = 'outstanding' | 'activated' | 'failed' | 'tested' | 'completed';

/** Parsed from MDF BAR PAIR. null when the value is unparseable. */
export interface BarPair {
  /** '01' | '09' in this pack, but not constrained — next week may differ. */
  readonly frame: string;
  /** 'A'-'W' | 'INTL'. */
  readonly block: string;
  /** Numeric, so A10 sorts after A9. */
  readonly number: number;
  readonly raw: string;
}

/** Defect codes attached at import. Surfaced as a "needs attention" badge. */
export type DefectCode = 'bad-barpair' | 'bad-old-equipment' | 'missing-job-number' | 'duplicate-job-number';

export interface JobProgress {
  readyToActivate: null | 'yes' | 'failed';
  /** ISO 8601. Written by the app on gate change, never typed. */
  activatedAt: string | null;
  testStatus: null | 'pass' | 'fail';
  testedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  /** A stable reason *code*, not a label — labels are editable (D11). */
  failReason: string | null;
  /** Engineer-entered on site; not in the source sheet. */
  vert: string | null;
  up: string | null;
  notes: string;
  /** Local "don't touch this row" guard (D12). */
  locked: boolean;
  updatedAt: string;
}

/** One entry in a job's change history — BRIEF §7.7. */
export interface HistoryEntry {
  readonly at: string;
  readonly field: string;
  readonly from: string | null;
  readonly to: string | null;
}

export interface Job {
  /** Derived from jobNumber. The merge key on re-import. */
  readonly id: string;
  /** Columns A-I verbatim, in sheet order. Read-only imported truth. */
  readonly source: Record<string, string>;
  /** The JOB column — row index within the pack, not an identifier. */
  readonly seq: number;
  /** The natural key. */
  readonly jobNumber: string;
  readonly barPair: BarPair | null;
  readonly jobType: JobType;
  readonly defects: DefectCode[];
  progress: JobProgress;
  history: HistoryEntry[];
  /** Set when a re-import no longer contains this job (never deleted). */
  missingSince?: string | null;
}

export interface Pack {
  readonly id: string;
  /** Display name, e.g. the exchange + pack reference. */
  name: string;
  /** Source column headers in sheet order — drives export round-tripping. */
  readonly columns: string[];
  /** Headers whose value is identical on every row (BRIEF §5, constant columns). */
  readonly constantColumns: Record<string, string>;
  /** Column header -> known role, remembered so re-import is one tap. */
  columnMapping: Record<string, ColumnRole | null>;
  readonly importedAt: string;
  lastImportedAt: string;
  readonly originalFileName: string;
  jobs: Job[];
}

/** The roles the importer knows how to use. Everything else is carried verbatim. */
export type ColumnRole =
  | 'seq'
  | 'jobNumber'
  | 'circuit'
  | 'barPair'
  | 'esideTies'
  | 'dsideTies'
  | 'newEquipment'
  | 'oldEquipment'
  | 'other';

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  seq: 'Row number',
  jobNumber: 'Job number (key)',
  circuit: 'Circuit / telephone number',
  barPair: 'MDF bar pair',
  esideTies: 'E-side ties',
  dsideTies: 'D-side ties',
  newEquipment: 'New equipment',
  oldEquipment: 'Old equipment',
  other: 'Other (kept, not used)',
};

/** Everything the app persists, encrypted as one blob (D3). */
export interface Vault {
  readonly schemaVersion: number;
  packs: Pack[];
  activePackId: string | null;
  settings: Settings;
}

export interface Settings {
  engineerName: string;
  /** 1-60, BRIEF §9.4. */
  autoLockMinutes: number;
  theme: 'dark' | 'sunlight';
  /** Editable fail-reason labels, keyed by stable code (D11). */
  failReasons: FailReason[];
  view: ViewSpec;
  /** Changes since the last backup prompt — BRIEF §9.5. */
  changesSinceBackup: number;
  lastBackupAt: string | null;
}

export interface FailReason {
  readonly code: string;
  label: string;
  /** false = hidden from the one-tap sheet but kept so old data still resolves. */
  enabled: boolean;
}

// --- View state (sort / filter / search), persisted across launches ---------

export type SortField =
  | 'framePosition'
  | 'jobNumber'
  | 'seq'
  | 'status'
  | 'updatedAt'
  | 'jobType'
  | `source:${string}`;

export type SortDirection = 'asc' | 'desc';

export type GroupMode = 'none' | 'block' | 'oldShelf' | 'status';

export type StatusFilter = 'all' | JobStatus | 'locked' | 'attention';

export interface ViewSpec {
  sortField: SortField;
  sortDirection: SortDirection;
  group: GroupMode;
  status: StatusFilter;
  /** null = no job-type filter. */
  jobType: JobType | null;
  /** null = no frame filter. */
  frame: string | null;
  search: string;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_VIEW: ViewSpec = {
  // Frame-walk order is the default (D7): the list should follow his feet,
  // not the order the office generated the pack in.
  sortField: 'framePosition',
  sortDirection: 'asc',
  group: 'none',
  status: 'all',
  jobType: null,
  frame: null,
  search: '',
};
