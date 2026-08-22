/**
 * The verbs. Everything the UI can do to a job lives here, so components stay
 * dumb and the behaviour is testable without rendering anything.
 */
import { parseBarPair } from '../data/barPair';
import { failGate, passGate, revertGate, setGate, type Gate } from '../data/transitions';
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

/** Tick: pass the current gate. One tap, correct timestamp, undo offered. */
export function markPass(jobId: string, options: MarkOptions = {}): void {
  const job = findJob(jobId);
  if (job === null || job.progress.locked) return;

  const change = passGate(job, nowIso(), engineerName());
  if (change.progress === job.progress) return; // nothing left to advance

  applyChange(job, change.progress, change.history, 'Marked pass', options);
  haptic(40);
}

/** Cross: fail the current gate with a reason code. */
export function markFail(jobId: string, reasonCode: string | null, options: MarkOptions = {}): void {
  const job = findJob(jobId);
  if (job === null || job.progress.locked) return;

  const change = failGate(job, nowIso(), reasonCode);
  applyChange(job, change.progress, change.history, 'Marked failed', options);
  // Two short pulses, so a fail feels different from a pass without looking.
  haptic([30, 60, 30]);
}

/** Step one gate backwards. */
export function markRevert(jobId: string, options: MarkOptions = {}): void {
  const job = findJob(jobId);
  if (job === null || job.progress.locked) return;

  const change = revertGate(job, nowIso());
  if (change.progress === job.progress) return;

  applyChange(job, change.progress, change.history, 'Reverted', options);
  haptic(20);
}

/** Set a specific gate from the detail screen's segmented controls. */
export function setJobGate(
  jobId: string,
  gate: Gate,
  value: 'yes' | 'failed' | 'pass' | 'fail' | 'done' | null,
): void {
  const job = findJob(jobId);
  if (job === null || job.progress.locked) return;

  const change = setGate(job, gate, value, nowIso(), engineerName());
  applyChange(job, change.progress, change.history, 'Changed', { advance: false });
  haptic(20);
}

// --- Free-text and flag edits ----------------------------------------------

export function setNotes(jobId: string, notes: string): void {
  updateJob(jobId, (job) => ({
    ...job,
    progress: { ...job.progress, notes, updatedAt: nowIso() },
  }));
}

export function setVertUp(jobId: string, vert: string | null, up: string | null): void {
  updateJob(jobId, (job) => ({
    ...job,
    progress: { ...job.progress, vert, up, updatedAt: nowIso() },
  }));
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

export function toggleLocked(jobId: string): void {
  updateJob(jobId, (job) => ({
    ...job,
    progress: { ...job.progress, locked: !job.progress.locked, updatedAt: nowIso() },
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
