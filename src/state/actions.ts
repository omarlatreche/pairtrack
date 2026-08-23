/**
 * The verbs. Everything the UI can do to a job lives here, so components stay
 * dumb and the behaviour is testable without rendering anything.
 */
import { parseBarPair } from '../data/barPair';
import { signOff, toggleDone } from '../data/transitions';
import { applyView } from '../data/view';
import type { HistoryEntry, Job, JobProgress } from '../data/types';
import { isMalformedEquipment } from '../import/buildJobs';
import { headerForRole } from '../import/columns';
import {
  activePack,
  countChange,
  findJob,
  getState,
  offerUndo,
  setState,
  updateJob,
} from './store';

/**
 * A short buzz on every mark — BRIEF §7.3.
 *
 * In gloves, at a frame, he is not looking at the screen when he taps. The
 * haptic is the confirmation, not the animation. Silently absent on iOS Safari,
 * which does not implement `vibrate`; the undo toast covers that case.
 */
function haptic(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // A vibrate that throws must never cost a tick.
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function engineerName(): string | null {
  const name = getState().vault?.settings.engineerName.trim() ?? '';
  return name === '' ? null : name;
}

/**
 * The job that follows `jobId` in the current sort order.
 *
 * Auto-advance: after marking, this one is scrolled to the top so he never
 * hunts for his place (BRIEF §7.3).
 */
function nextJobAfter(jobId: string): string | null {
  const pack = activePack();
  const view = getState().vault?.settings.view;
  if (pack === null || view === undefined) return null;

  const { jobs } = applyView(pack.jobs, view, headerForRole(pack.columnMapping, 'oldEquipment'));
  const index = jobs.findIndex((job) => job.id === jobId);
  if (index === -1) return null;
  return jobs[index + 1]?.id ?? null;
}

export interface MarkOptions {
  /** false on the detail screen — marking there should not scroll the list. */
  readonly advance?: boolean;
}

function applyChange(
  job: Job,
  progress: JobProgress,
  history: HistoryEntry[],
  label: string,
  options: MarkOptions,
): void {
  updateJob(job.id, (current) => ({ ...current, progress, history }));
  countChange();
  // Undo restores the whole job rather than applying an inverse: an inverse can
  // drift from the forward operation, a restore cannot.
  offerUndo({ label, jobId: job.id, previous: job });

  if (options.advance !== false) {
    setState({ scrollToJobId: nextJobAfter(job.id) });
  }
}

/**
 * The only per-job action there is (D17): tick it, or un-tick it.
 *
 * He tapped through three gates before and said it was too complicated. One tap
 * on the card marks the job done and stamps the time; tapping again undoes it.
 */
export function toggleJobDone(jobId: string, options: MarkOptions = {}): void {
  const job = findJob(jobId);
  if (job === null) return;

  const wasDone = job.progress.doneAt !== null;
  const change = toggleDone(job, nowIso(), engineerName());

  applyChange(job, change.progress, [], change.label, options);
  // Un-ticking feels different from ticking without having to look.
  haptic(wasDone ? 20 : 40);
}

/**
 * The batch action: sign off everything currently pending.
 *
 * `signOff` returns null for anything not pending, so this cannot sign off a
 * job he never ticked, and running it twice is harmless.
 */
export function signOffPending(): number {
  const pack = activePack();
  if (pack === null) return 0;

  const now = nowIso();
  const ids = pack.jobs.filter((j) => signOff(j.progress, now) !== null).map((j) => j.id);
  if (ids.length === 0) return 0;

  for (const id of ids) {
    updateJob(id, (job) => {
      const progress = signOff(job.progress, now);
      return progress === null ? job : { ...job, progress };
    });
  }

  countChange();
  haptic([30, 40]);
  return ids.length;
}

export function setCompletedBy(jobId: string, completedBy: string): void {
  updateJob(jobId, (job) => ({
    ...job,
    progress: {
      ...job.progress,
      completedBy: completedBy.trim() === '' ? null : completedBy,
      updatedAt: nowIso(),
    },
  }));
}

/**
 * Correct a source value in-app — BRIEF §7.8, for the two malformed rows.
 *
 * The only sanctioned write to `source`. It re-derives the bar pair and clears
 * the matching defect flag, so a corrected row stops showing "needs attention"
 * and starts sorting into its real frame position instead of Unplaced.
 */
export function correctSourceValue(jobId: string, column: string, value: string): void {
  const pack = activePack();
  if (pack === null) return;

  const barPairColumn = headerForRole(pack.columnMapping, 'barPair');
  const oldEquipColumn = headerForRole(pack.columnMapping, 'oldEquipment');

  updateJob(jobId, (job) => {
    const source = { ...job.source, [column]: value };
    let barPair = job.barPair;
    let defects = job.defects;

    if (column === barPairColumn) {
      barPair = parseBarPair(value);
      defects =
        barPair === null
          ? defects.includes('bad-barpair')
            ? defects
            : [...defects, 'bad-barpair']
          : defects.filter((d) => d !== 'bad-barpair');
    }

    if (column === oldEquipColumn) {
      defects = isMalformedEquipment(value)
        ? defects.includes('bad-old-equipment')
          ? defects
          : [...defects, 'bad-old-equipment']
        : defects.filter((d) => d !== 'bad-old-equipment');
    }

    return { ...job, source, barPair, defects, progress: { ...job.progress, updatedAt: nowIso() } };
  });
}
