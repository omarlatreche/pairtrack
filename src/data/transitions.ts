/**
 * Status derivation and the two things that change it — BRIEF §5.1, D17.
 *
 * This used to be a three-gate table (Ready to activate → Test → Completed)
 * with a failed branch, modelled on the old tool's columns. The engineer used it
 * and said it was too complicated: he wants done or not done, and nothing else
 * to decide at the frame. So there is one per-job action, `toggleDone`, and one
 * batch action, `signOff`.
 *
 * Status is still **derived**, never stored (D9). A stored status is a second
 * source of truth and it drifts.
 *
 * Everything here is pure. No IO, no clock beyond an injected `now`.
 */
import type { Job, JobProgress, JobStatus } from './types';

/**
 * `pending` means ticked at the frame but not yet signed off. It is not a
 * decision he makes — it is where a job sits between his tap and the batch.
 */
export function deriveStatus(progress: JobProgress): JobStatus {
  if (progress.signedOffAt !== null) return 'signed-off';
  if (progress.doneAt !== null) return 'pending';
  return 'outstanding';
}

export interface ProgressChange {
  readonly progress: JobProgress;
  /** Human-readable, for the undo toast. */
  readonly label: string;
}

/**
 * The single per-job action: tick it, or un-tick it.
 *
 * Un-ticking a job that has already been signed off clears the sign-off too —
 * otherwise the job would sit in an impossible state (signed off, not done).
 */
export function toggleDone(job: Job, now: string, completedBy: string | null): ProgressChange {
  const p = job.progress;

  if (p.doneAt !== null) {
    return {
      progress: { ...p, doneAt: null, signedOffAt: null, completedBy: null, updatedAt: now },
      label: 'Marked not done',
    };
  }

  return {
    progress: { ...p, doneAt: now, completedBy, updatedAt: now },
    label: 'Marked done',
  };
}

/**
 * The batch action: sign off everything currently pending.
 *
 * Only touches jobs that are done and not yet signed off, so running it twice
 * is harmless and it can never sign off something he has not ticked.
 */
export function signOff(progress: JobProgress, now: string): JobProgress | null {
  if (progress.doneAt === null || progress.signedOffAt !== null) return null;
  return { ...progress, signedOffAt: now, updatedAt: now };
}

export function emptyProgress(now: string): JobProgress {
  return {
    doneAt: null,
    signedOffAt: null,
    completedBy: null,
    updatedAt: now,
  };
}

/** Does this job carry anything worth preserving across a re-import? */
export function hasProgress(progress: JobProgress): boolean {
  return progress.doneAt !== null || progress.signedOffAt !== null;
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  outstanding: 'Not done',
  pending: 'Done',
  'signed-off': 'Signed off',
};

/** Sort order for grouping by status: what still needs doing comes first. */
export const STATUS_RANK: Record<JobStatus, number> = {
  outstanding: 0,
  pending: 1,
  'signed-off': 2,
};
