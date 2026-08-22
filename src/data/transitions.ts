/**
 * Status derivation and the legal-transition table — BRIEF §5.1.
 *
 * Status is **derived**, never stored (D9). A stored status is a second source
 * of truth and it drifts; deriving it means a gate change cannot leave the
 * badge wrong.
 *
 * Everything here is pure. No IO, no clock beyond an injected `now`, so the
 * whole table is unit-testable.
 */
import type { HistoryEntry, Job, JobProgress, JobStatus } from './types';

/**
 * The three gates, in order. Each has a value field and a timestamp field that
 * the app writes.
 */
export type Gate = 'activate' | 'test' | 'complete';

export function deriveStatus(progress: JobProgress): JobStatus {
  // Failure at any gate wins — a failed job is not "in progress".
  if (progress.readyToActivate === 'failed' || progress.testStatus === 'fail') {
    return 'failed';
  }
  if (progress.completedAt !== null) return 'completed';
  if (progress.testStatus === 'pass') return 'tested';
  if (progress.readyToActivate === 'yes') return 'activated';
  return 'outstanding';
}

/**
 * The gate a tick or a cross applies to right now.
 *
 * This is what makes one-tap work: he never picks a gate, the app knows which
 * one is next. A failed job re-opens at the gate that failed.
 */
export function currentGate(progress: JobProgress): Gate | null {
  if (progress.readyToActivate === 'failed') return 'activate';
  if (progress.testStatus === 'fail') return 'test';
  if (progress.readyToActivate !== 'yes') return 'activate';
  if (progress.testStatus !== 'pass') return 'test';
  if (progress.completedAt === null) return 'complete';
  return null; // fully complete — nothing left to advance
}

export const GATE_LABELS: Record<Gate, string> = {
  activate: 'Ready to activate',
  test: 'Test',
  complete: 'Completed',
};

/** Legal transitions, for the tests and for the detail screen's segmented controls. */
export const LEGAL_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  outstanding: ['activated', 'failed'],
  activated: ['tested', 'failed', 'outstanding'],
  tested: ['completed', 'failed', 'activated'],
  completed: ['tested'],
  failed: ['outstanding', 'activated', 'tested'],
};

export function isLegalTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export interface ProgressChange {
  readonly progress: JobProgress;
  readonly history: HistoryEntry[];
}

function record(
  history: HistoryEntry[],
  at: string,
  field: string,
  from: string | null,
  to: string | null,
): HistoryEntry[] {
  if (from === to) return history;
  return [...history, { at, field, from, to }];
}

/**
 * Pass the current gate. Writes the gate's timestamp — timestamps are always
 * written by the app, never typed (BRIEF §5.1).
 */
export function passGate(job: Job, now: string, completedBy: string | null): ProgressChange {
  const p = { ...job.progress };
  let history = job.history;
  const gate = currentGate(p);

  switch (gate) {
    case 'activate':
      history = record(history, now, 'Ready to activate', p.readyToActivate, 'yes');
      p.readyToActivate = 'yes';
      p.activatedAt = now;
      // Passing a previously-failed gate clears the reason: it no longer applies.
      if (p.failReason !== null) {
        history = record(history, now, 'Fail reason', p.failReason, null);
        p.failReason = null;
      }
      break;

    case 'test':
      history = record(history, now, 'Test status', p.testStatus, 'pass');
      p.testStatus = 'pass';
      p.testedAt = now;
      if (p.failReason !== null) {
        history = record(history, now, 'Fail reason', p.failReason, null);
        p.failReason = null;
      }
      break;

    case 'complete':
      history = record(history, now, 'Completed', null, now);
      p.completedAt = now;
      p.completedBy = completedBy;
      break;

    case null:
      return { progress: job.progress, history: job.history };
  }

  p.updatedAt = now;
  return { progress: p, history };
}

/**
 * Fail the current gate. A fail must be as fast as a pass or it does not get
 * recorded properly (BRIEF §7.6).
 */
export function failGate(job: Job, now: string, reasonCode: string | null): ProgressChange {
  const p = { ...job.progress };
  let history = job.history;
  const gate = currentGate(p) ?? 'complete';

  if (gate === 'activate') {
    history = record(history, now, 'Ready to activate', p.readyToActivate, 'failed');
    p.readyToActivate = 'failed';
    p.activatedAt = null;
  } else {
    // Failing at the test or completion gate records a test failure — that is
    // the only fail state the source workflow has past activation.
    history = record(history, now, 'Test status', p.testStatus, 'fail');
    p.testStatus = 'fail';
    p.testedAt = now;
    p.completedAt = null;
    p.completedBy = null;
  }

  history = record(history, now, 'Fail reason', p.failReason, reasonCode);
  p.failReason = reasonCode;
  p.updatedAt = now;

  return { progress: p, history };
}

/**
 * Step one gate backwards. This is what "undo" and the detail screen's
 * segmented controls use — everything is revertible (BRIEF §5.1).
 */
export function revertGate(job: Job, now: string): ProgressChange {
  const p = { ...job.progress };
  let history = job.history;

  if (p.completedAt !== null) {
    history = record(history, now, 'Completed', p.completedAt, null);
    p.completedAt = null;
    p.completedBy = null;
  } else if (p.testStatus !== null) {
    history = record(history, now, 'Test status', p.testStatus, null);
    p.testStatus = null;
    p.testedAt = null;
    history = record(history, now, 'Fail reason', p.failReason, null);
    p.failReason = null;
  } else if (p.readyToActivate !== null) {
    history = record(history, now, 'Ready to activate', p.readyToActivate, null);
    p.readyToActivate = null;
    p.activatedAt = null;
    history = record(history, now, 'Fail reason', p.failReason, null);
    p.failReason = null;
  } else {
    return { progress: job.progress, history: job.history };
  }

  p.updatedAt = now;
  return { progress: p, history };
}

/**
 * Set a gate to an explicit value from the detail screen. Clearing a gate
 * clears its timestamp — the rule in BRIEF §5.1 runs in both directions.
 */
export function setGate(
  job: Job,
  gate: Gate,
  value: 'yes' | 'failed' | 'pass' | 'fail' | 'done' | null,
  now: string,
  completedBy: string | null,
): ProgressChange {
  const p = { ...job.progress };
  let history = job.history;

  if (gate === 'activate') {
    const next = value === 'yes' || value === 'failed' ? value : null;
    history = record(history, now, 'Ready to activate', p.readyToActivate, next);
    p.readyToActivate = next;
    p.activatedAt = next === 'yes' ? now : null;
    if (next !== 'failed' && p.testStatus === null) {
      p.failReason = null;
    }
  } else if (gate === 'test') {
    const next = value === 'pass' || value === 'fail' ? value : null;
    history = record(history, now, 'Test status', p.testStatus, next);
    p.testStatus = next;
    p.testedAt = next === null ? null : now;
    if (next !== 'fail' && p.readyToActivate !== 'failed') {
      p.failReason = null;
    }
  } else {
    const done = value === 'done';
    history = record(history, now, 'Completed', p.completedAt, done ? now : null);
    p.completedAt = done ? now : null;
    p.completedBy = done ? completedBy : null;
  }

  p.updatedAt = now;
  return { progress: p, history };
}

export function emptyProgress(now: string): JobProgress {
  return {
    readyToActivate: null,
    activatedAt: null,
    testStatus: null,
    testedAt: null,
    completedAt: null,
    completedBy: null,
    failReason: null,
    vert: null,
    up: null,
    notes: '',
    locked: false,
    updatedAt: now,
  };
}

/** True when the job has any recorded progress — used by the merge preview. */
export function hasProgress(progress: JobProgress): boolean {
  return (
    progress.readyToActivate !== null ||
    progress.testStatus !== null ||
    progress.completedAt !== null ||
    progress.notes.trim() !== '' ||
    progress.vert !== null ||
    progress.up !== null ||
    progress.locked
  );
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  outstanding: 'Outstanding',
  activated: 'Activated',
  tested: 'Tested',
  completed: 'Completed',
  failed: 'Failed',
};

/** Sort rank for status, so "sort by status" follows the workflow, not the alphabet. */
export const STATUS_RANK: Record<JobStatus, number> = {
  outstanding: 0,
  failed: 1,
  activated: 2,
  tested: 3,
  completed: 4,
};
