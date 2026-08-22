/**
 * The job card — BRIEF §7.3.
 *
 * The single biggest improvement over the current tool: a 15-column table on a
 * 6" screen is 22 seconds of horizontal scrolling to reach the one control that
 * matters. This shows the five things he needs and the two buttons he presses.
 *
 * Information priority, top to bottom, is the brief's and not negotiable:
 *   1. job number, large, tabular — matched against paperwork and the frame
 *   2. frame position — what he navigates by
 *   3. the actual move, old -> new
 *   4. job type badge — tells him how long it takes before he walks to it
 *   5. status chip — colour AND text AND icon, never colour alone
 */
import { formatBarPair } from '../../data/barPair';
import { failReasonLabel } from '../../data/failReasons';
import { currentGate, deriveStatus, GATE_LABELS, STATUS_LABELS } from '../../data/transitions';
import type { FailReason, Job } from '../../data/types';
import { JOB_TYPE_LABELS } from '../../data/view';
import { formatStampSmart } from './format';
import { CrossIcon, DotIcon, LockIcon, TickIcon, WarnIcon } from './Icons';

interface JobCardProps {
  readonly job: Job;
  /** Column headers for the two equipment values and the tie references. */
  readonly columns: {
    readonly oldEquipment: string | null;
    readonly newEquipment: string | null;
    readonly esideTies: string | null;
    readonly dsideTies: string | null;
  };
  readonly failReasons: FailReason[];
  readonly onOpen: (jobId: string) => void;
  readonly onPass: (jobId: string) => void;
  readonly onFail: (jobId: string) => void;
}

const STATUS_ICON = {
  outstanding: DotIcon,
  activated: DotIcon,
  tested: DotIcon,
  completed: TickIcon,
  failed: CrossIcon,
} as const;

export function JobCard({ job, columns, failReasons, onOpen, onPass, onFail }: JobCardProps) {
  const status = deriveStatus(job.progress);
  const gate = currentGate(job.progress);
  const StatusIcon = STATUS_ICON[status];

  const oldEquipment = columns.oldEquipment ? job.source[columns.oldEquipment] : '';
  const newEquipment = columns.newEquipment ? job.source[columns.newEquipment] : '';
  const eside = columns.esideTies ? job.source[columns.esideTies] : '';
  const dside = columns.dsideTies ? job.source[columns.dsideTies] : '';

  // Only the 222 jobs that have ties show the tie row; on the other 217 it
  // would be an empty line of noise.
  const hasTies = (eside ?? '') !== '' || (dside ?? '') !== '';

  const locked = job.progress.locked;
  const complete = gate === null;

  const gateHint = gate === null ? 'Done' : GATE_LABELS[gate];

  return (
    <article class={`card card--${status}${locked ? ' card--locked' : ''}`}>
      <button
        type="button"
        class="card__body"
        onClick={() => onOpen(job.id)}
        aria-label={`Open job ${job.jobNumber}, ${STATUS_LABELS[status]}`}
      >
        <span class="card__number">{job.jobNumber}</span>

        <div class="card__chips">
          <span class="tag tag--position">{formatBarPair(job.barPair)}</span>

          <span class={`tag tag--type-${job.jobType}`}>{JOB_TYPE_LABELS[job.jobType]}</span>

          <span class={`status status--${status}`}>
            <StatusIcon size={13} />
            {STATUS_LABELS[status]}
          </span>

          {locked && (
            <span class="tag">
              <LockIcon size={12} />
              Locked
            </span>
          )}

          {job.defects.length > 0 && (
            <span class="tag tag--attention">
              <WarnIcon size={12} />
              Needs attention
            </span>
          )}

          {job.missingSince != null && <span class="tag tag--missing">Not in latest pack</span>}
        </div>

        {(oldEquipment || newEquipment) && (
          <div class="card__move">
            <strong>{oldEquipment || '—'}</strong>
            <span aria-hidden="true">→</span>
            <strong>{newEquipment || '—'}</strong>
          </div>
        )}

        {hasTies && (
          <div class="card__ties">
            {eside ? `E ${eside}` : ''}
            {eside && dside ? '  ·  ' : ''}
            {dside ? `D ${dside}` : ''}
          </div>
        )}

        {job.progress.failReason !== null && (
          <div class="card__reason">{failReasonLabel(failReasons, job.progress.failReason)}</div>
        )}

        {job.progress.notes.trim() !== '' && <div class="card__notes">{job.progress.notes}</div>}

        {status !== 'outstanding' && (
          <div class="card__ties">
            {formatStampSmart(
              job.progress.completedAt ?? job.progress.testedAt ?? job.progress.activatedAt,
            )}
          </div>
        )}
      </button>

      <div class="card__actions">
        <button
          type="button"
          class="mark mark--pass"
          disabled={locked || complete}
          onClick={() => onPass(job.id)}
          aria-label={
            complete
              ? `${job.jobNumber} is already complete`
              : `Pass ${gateHint} for job ${job.jobNumber}`
          }
        >
          <TickIcon size={28} />
        </button>

        <button
          type="button"
          class="mark mark--fail"
          disabled={locked}
          onClick={() => onFail(job.id)}
          aria-label={`Fail ${gateHint} for job ${job.jobNumber}`}
        >
          <CrossIcon size={28} />
        </button>
      </div>
    </article>
  );
}
