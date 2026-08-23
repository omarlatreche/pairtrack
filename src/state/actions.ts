/**
 * The verbs. Everything the UI can do to a job lives here, so components stay
 * dumb and the behaviour is testable without rendering anything.
 */
import { parseBarPair } from '../data/barPair';
import { signOff, toggleDone } from '../data/transitions';
import type { HistoryEntry, Job, JobProgress } from '../data/types';
import { isMalformedEquipment } from '../import/buildJobs';
import { headerForRole } from '../import/columns';
import {
  activePack,
  countBackupChange,
  countChange,
  findJob,
  getState,
  offerUndo,
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

function applyChange(
  job: Job,
  progress: JobProgress,
  history: HistoryEntry[],
  label: string,
): void {
  updateJob(job.id, (current) => ({ ...current, progress, history }));
  countChange();
  // Undo restores the whole job rather than applying an inverse: an inverse can
  // drift from the forward operation, a restore cannot.
  offerUndo({ label, previous: [job], countedChanges: 1 });

}

/**
 * The only per-job action there is (D17): tick it, or un-tick it.
 *
 * He tapped through three gates before and said it was too complicated. One tap
 * on the card marks the job done and stamps the time; tapping again undoes it.
 */
export function toggleJobDone(jobId: string): void {
  const job = findJob(jobId);
  if (job === null) return;

  const wasDone = job.progress.doneAt !== null;
  const change = toggleDone(job, nowIso(), engineerName());

  applyChange(job, change.progress, [], change.label);
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
  const affected = pack.jobs.filter((j) => signOff(j.progress, now) !== null);
  if (affected.length === 0) return 0;

  for (const job of affected) {
    updateJob(job.id, (current) => {
      const progress = signOff(current.progress, now);
      return progress === null ? current : { ...current, progress };
    });
  }

  // Backup pressure only: nothing moved from not-done to done here, so this
  // must not inflate "done this session" — and undo must not deflate it.
  countBackupChange(affected.length);

  // A batch is exactly where undo matters most: one tap changes every pending
  // job, and there is no way to put them back by hand — un-ticking and
  // re-ticking would discard the original done timestamps, which are the times
  // the work actually happened. The snapshot restores them intact.
  offerUndo({
    label: `Signed off ${affected.length} ${affected.length === 1 ? 'job' : 'jobs'}`,
    previous: affected,
    countedChanges: 0,
  });

  haptic([30, 40]);
  return affected.length;
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
