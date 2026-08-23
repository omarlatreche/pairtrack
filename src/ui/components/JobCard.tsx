/**
 * The job card — BRIEF §7.3, rewritten for D17.
 *
 * The engineer used the previous version and said it was too complicated: he
 * should not have to click a job to see its details, should not have to click
 * jobs at all, and wants every field on the front screen. So:
 *
 *   - the whole card is one tap target, and the tap means DONE
 *   - there is nothing to open, and no second screen to open it into
 *   - every per-row field the pack carries is on the card
 *
 * Information priority is his, not the brief's. He said JOB is the identifier
 * he works from, so JOB leads and the job number sits under it as the reference
 * he quotes to the office. (JOB is a row index and is NOT the key the app
 * matches on — see D17.)
 *
 * `DB` and `New_Equipment` are deliberately absent: both are constant across
 * the whole pack, so repeating them 442 times tells him nothing. They are shown
 * once in the pack header instead.
 */
import { formatBarPair } from '../../data/barPair';
import { deriveStatus, STATUS_LABELS } from '../../data/transitions';
import type { Job } from '../../data/types';
import { JOB_TYPE_LABELS } from '../../data/view';
import { formatStampSmart } from './format';
import { DotIcon, TickIcon, WarnIcon } from './Icons';

interface JobCardProps {
  readonly job: Job;
  /** Headers for the per-row source values worth showing. */
  readonly columns: {
    readonly circuit: string | null;
    readonly oldEquipment: string | null;
    readonly esideTies: string | null;
    readonly dsideTies: string | null;
  };
  readonly onToggleDone: (jobId: string) => void;
}

const STATUS_ICON = {
  outstanding: DotIcon,
  pending: TickIcon,
  'signed-off': TickIcon,
} as const;

export function JobCard({ job, columns, onToggleDone }: JobCardProps) {
  const status = deriveStatus(job.progress);
  const StatusIcon = STATUS_ICON[status];

  const circuit = columns.circuit ? job.source[columns.circuit] : '';
  const oldEquipment = columns.oldEquipment ? job.source[columns.oldEquipment] : '';
  const eside = columns.esideTies ? job.source[columns.esideTies] : '';
  const dside = columns.dsideTies ? job.source[columns.dsideTies] : '';

  // Only the jobs that have ties show the tie row; on the rest it would be an
  // empty line of noise.
  const hasTies = (eside ?? '') !== '' || (dside ?? '') !== '';

  const done = job.progress.doneAt !== null;

  return (
    <button
      type="button"
      class={`card card--${status}`}
      // One tap, and it says what it will do rather than what the job is, so it
      // is unambiguous in gloves and to a screen reader.
      aria-pressed={done}
      aria-label={`Job ${job.seq}, ${STATUS_LABELS[status]}. Tap to mark ${done ? 'not done' : 'done'}.`}
      onClick={() => onToggleDone(job.id)}
    >
      <div class="card__lead">
        <span class="card__seq">{job.seq}</span>
        <span class={`card__status card__status--${status}`}>
          <StatusIcon size={20} />
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div class="card__facts">
        <span class="card__ref">{job.jobNumber}</span>
        <span class="tag tag--position">{formatBarPair(job.barPair)}</span>
        <span class={`tag tag--type-${job.jobType}`}>{JOB_TYPE_LABELS[job.jobType]}</span>
      </div>

      {circuit ? <div class="card__circuit">{circuit}</div> : null}

      {oldEquipment ? <div class="card__move">From {oldEquipment}</div> : null}

      {hasTies && (
        <div class="card__ties">
          {eside ? `E ${eside}` : ''}
          {eside && dside ? '  ·  ' : ''}
          {dside ? `D ${dside}` : ''}
        </div>
      )}

      {job.defects.length > 0 && (
        <div class="card__flags">
          <span class="tag tag--attention">
            <WarnIcon size={14} /> Check this row
          </span>
        </div>
      )}

      {job.missingSince != null && (
        <div class="card__flags">
          <span class="tag tag--missing">Not in latest pack</span>
        </div>
      )}

      {done && <div class="card__when">{formatStampSmart(job.progress.doneAt)}</div>}
    </button>
  );
}
