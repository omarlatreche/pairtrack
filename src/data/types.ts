/**
 * The data model — BRIEF §5.
 *
 * The one structural rule: `source` is imported truth and is never mutated;
 * `progress` belongs to the app. Keeping them in separate objects is what lets
 * next week's pack refresh the source data without touching a single tick.
 */

export type JobType = 'no-ties' | 'ed-side' | 'llu';

/**
 * Two things he does, one thing the batch does (D17).
 *
 * `pending` is not a third thing to decide: it is simply "ticked at the frame,
 * not yet signed off". The old tool called the same idea "Completed pending".
 */
export type JobStatus = 'outstanding' | 'pending' | 'signed-off';

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
  /**
   * Ticked at the frame. ISO 8601, written by the app, never typed.
   *
   * Stamped when he taps, NOT when the batch is signed off — the moment the
   * work happened is the true one, and it is the only timestamp he said matters
   * (D17).
   */
  doneAt: string | null;
  /** Set when the pending pile is signed off as a batch. */
  signedOffAt: string | null;
  /** Auto-filled from settings.engineerName. Never typed per job. */
  completedBy: string | null;
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
  view: ViewSpec;
  /** Changes since the last backup prompt — BRIEF §9.5. */
  changesSinceBackup: number;
  lastBackupAt: string | null;
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

export type StatusFilter = 'all' | JobStatus | 'attention';

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

export const SCHEMA_VERSION = 2;

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
