/**
 * Job detail — BRIEF §7.7.
 *
 * Every source field in the original column order, read-only and clearly
 * separated from the editable progress block. The three gates as large
 * segmented controls, and a per-job change history at the bottom — that history
 * is what saves him when the office queries a job three weeks later.
 */
import { useState } from 'preact/hooks';
import { formatBarPair } from '../../data/barPair';
import { failReasonLabel } from '../../data/failReasons';
import { deriveStatus, GATE_LABELS, STATUS_LABELS } from '../../data/transitions';
import type { Job, Pack, Settings } from '../../data/types';
import { JOB_TYPE_LABELS } from '../../data/view';
import { headerForRole } from '../../import/columns';
import {
  correctSourceValue,
  setCompletedBy,
  setJobGate,
  setNotes,
  setVertUp,
  toggleLocked,
} from '../../state/actions';
import { setState } from '../../state/store';
import { formatStamp } from '../components/format';
import { BackIcon, LockIcon, WarnIcon } from '../components/Icons';

interface JobDetailScreenProps {
  readonly job: Job;
  readonly pack: Pack;
  readonly settings: Settings;
}

const DEFECT_LABELS: Record<string, string> = {
  'bad-barpair': 'The bar pair in the pack is not a valid frame reference.',
  'bad-old-equipment': 'The old equipment reference is malformed — the port segment is missing.',
  'missing-job-number': 'This row had no job number in the pack.',
  'duplicate-job-number': 'This job number appears more than once in the pack.',
};

export function JobDetailScreen({ job, pack, settings }: JobDetailScreenProps) {
  const status = deriveStatus(job.progress);
  const locked = job.progress.locked;

  const [notesDraft, setNotesDraft] = useState(job.progress.notes);
  const [vertDraft, setVertDraft] = useState(job.progress.vert ?? '');
  const [upDraft, setUpDraft] = useState(job.progress.up ?? '');
  const [byDraft, setByDraft] = useState(job.progress.completedBy ?? settings.engineerName);

  const barPairColumn = headerForRole(pack.columnMapping, 'barPair');
  const oldEquipColumn = headerForRole(pack.columnMapping, 'oldEquipment');

  const correctableColumns = [
    job.defects.includes('bad-barpair') ? barPairColumn : null,
    job.defects.includes('bad-old-equipment') ? oldEquipColumn : null,
  ].filter((column): column is string => column !== null);

  return (
    <div class="panel">
      <button
        type="button"
        class="button"
        style={{ marginBottom: '16px' }}
        onClick={() => setState({ screen: { name: 'list' } })}
      >
        <BackIcon size={20} />
        Back to the list
      </button>

      <h1 class="detail__number">{job.jobNumber}</h1>

      <div class="card__chips" style={{ marginBottom: '8px' }}>
        <span class="tag tag--position">{formatBarPair(job.barPair)}</span>
        <span class={`tag tag--type-${job.jobType}`}>{JOB_TYPE_LABELS[job.jobType]}</span>
        <span class={`status status--${status}`}>{STATUS_LABELS[status]}</span>
        {job.missingSince != null && <span class="tag tag--missing">Not in latest pack</span>}
      </div>

      {job.defects.length > 0 && (
        <div class="callout callout--warn">
          <strong>
            <WarnIcon size={16} /> Needs attention
          </strong>
          {job.defects.map((defect) => (
            <p key={defect}>{DEFECT_LABELS[defect] ?? defect}</p>
          ))}
        </div>
      )}

      {/* Correct a malformed source value in-app — BRIEF §7.8. */}
      {correctableColumns.map((column) => (
        <label class="field" key={column}>
          <span class="field__label">Correct {column}</span>
          <input
            class="input input--mono"
            defaultValue={job.source[column] ?? ''}
            onBlur={(event) =>
              correctSourceValue(job.id, column, (event.target as HTMLInputElement).value)
            }
          />
          <p class="field__hint">
            The value from the pack is kept until you change it. Fixing it here puts the job back
            in frame-walk order.
          </p>
        </label>
      ))}

      {locked && (
        <div class="callout">
          <strong>
            <LockIcon size={16} /> This job is locked
          </strong>
          <p>Unlock it below before marking it.</p>
        </div>
      )}

      <section class="section">
        <h2 class="section__title">Progress</h2>

        <div class="gate">
          <div class="gate__label">
            <span>{GATE_LABELS.activate}</span>
            <span class="gate__stamp">{formatStamp(job.progress.activatedAt)}</span>
          </div>
          <div class="segmented">
            <button
              type="button"
              class="segmented__option"
              disabled={locked}
              aria-pressed={job.progress.readyToActivate === null}
              onClick={() => setJobGate(job.id, 'activate', null)}
            >
              —
            </button>
            <button
              type="button"
              class="segmented__option segmented__option--pass"
              disabled={locked}
              aria-pressed={job.progress.readyToActivate === 'yes'}
              onClick={() => setJobGate(job.id, 'activate', 'yes')}
            >
              Yes
            </button>
            <button
              type="button"
              class="segmented__option segmented__option--fail"
              disabled={locked}
              aria-pressed={job.progress.readyToActivate === 'failed'}
              onClick={() => setJobGate(job.id, 'activate', 'failed')}
            >
              Failed
            </button>
          </div>
        </div>

        <div class="gate">
          <div class="gate__label">
            <span>{GATE_LABELS.test}</span>
            <span class="gate__stamp">{formatStamp(job.progress.testedAt)}</span>
          </div>
          <div class="segmented">
            <button
              type="button"
              class="segmented__option"
              disabled={locked}
              aria-pressed={job.progress.testStatus === null}
              onClick={() => setJobGate(job.id, 'test', null)}
            >
              —
            </button>
            <button
              type="button"
              class="segmented__option segmented__option--pass"
              disabled={locked}
              aria-pressed={job.progress.testStatus === 'pass'}
              onClick={() => setJobGate(job.id, 'test', 'pass')}
            >
              Pass
            </button>
            <button
              type="button"
              class="segmented__option segmented__option--fail"
              disabled={locked}
              aria-pressed={job.progress.testStatus === 'fail'}
              onClick={() => setJobGate(job.id, 'test', 'fail')}
            >
              Fail
            </button>
          </div>
        </div>

        <div class="gate">
          <div class="gate__label">
            <span>{GATE_LABELS.complete}</span>
            <span class="gate__stamp">{formatStamp(job.progress.completedAt)}</span>
          </div>
          <div class="segmented">
            <button
              type="button"
              class="segmented__option"
              disabled={locked}
              aria-pressed={job.progress.completedAt === null}
              onClick={() => setJobGate(job.id, 'complete', null)}
            >
              Not yet
            </button>
            <button
              type="button"
              class="segmented__option segmented__option--pass"
              disabled={locked}
              aria-pressed={job.progress.completedAt !== null}
              onClick={() => setJobGate(job.id, 'complete', 'done')}
            >
              Completed
            </button>
          </div>
        </div>

        {job.progress.failReason !== null && (
          <div class="callout callout--danger">
            <strong>Fail reason</strong>
            <p>{failReasonLabel(settings.failReasons, job.progress.failReason)}</p>
          </div>
        )}
      </section>

      <section class="section">
        <h2 class="section__title">On site</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <label class="field">
            <span class="field__label">VERT</span>
            <input
              class="input input--mono"
              inputMode="numeric"
              value={vertDraft}
              onInput={(event) => setVertDraft((event.target as HTMLInputElement).value)}
              onBlur={() =>
                setVertUp(
                  job.id,
                  vertDraft.trim() === '' ? null : vertDraft.trim(),
                  upDraft.trim() === '' ? null : upDraft.trim(),
                )
              }
            />
          </label>

          <label class="field">
            <span class="field__label">UP</span>
            <input
              class="input input--mono"
              inputMode="numeric"
              value={upDraft}
              onInput={(event) => setUpDraft((event.target as HTMLInputElement).value)}
              onBlur={() =>
                setVertUp(
                  job.id,
                  vertDraft.trim() === '' ? null : vertDraft.trim(),
                  upDraft.trim() === '' ? null : upDraft.trim(),
                )
              }
            />
          </label>
        </div>

        <label class="field">
          <span class="field__label">Notes</span>
          <textarea
            class="textarea"
            value={notesDraft}
            onInput={(event) => setNotesDraft((event.target as HTMLTextAreaElement).value)}
            onBlur={() => setNotes(job.id, notesDraft)}
          />
        </label>

        <label class="field">
          <span class="field__label">Completed by</span>
          <input
            class="input"
            value={byDraft}
            onInput={(event) => setByDraft((event.target as HTMLInputElement).value)}
            onBlur={() => setCompletedBy(job.id, byDraft)}
          />
        </label>

        <button type="button" class="button" onClick={() => toggleLocked(job.id)}>
          <LockIcon size={20} />
          {locked ? 'Unlock this job' : 'Lock this job'}
        </button>
      </section>

      <section class="section">
        <h2 class="section__title">From the job pack</h2>
        <div class="kv">
          {pack.columns.map((column) => {
            const value = job.source[column] ?? '';
            return [
              <div class="kv__key" key={`${column}-k`}>
                {column}
              </div>,
              <div class={`kv__value${value === '' ? ' kv__value--empty' : ''}`} key={`${column}-v`}>
                {value === '' ? 'empty' : value}
              </div>,
            ];
          })}
        </div>
        {Object.keys(pack.constantColumns).length > 0 && (
          <p class="field__hint">
            {Object.entries(pack.constantColumns)
              .map(([column, value]) => `${column}: ${value}`)
              .join(' · ')}{' '}
            — the same on every job in this pack.
          </p>
        )}
      </section>

      <section class="section">
        <h2 class="section__title">History</h2>
        {job.history.length === 0 ? (
          <p class="field__hint">Nothing recorded yet.</p>
        ) : (
          <ul class="history">
            {[...job.history].reverse().map((entry, index) => (
              <li class="history__item" key={`${entry.at}-${index}`}>
                <span class="history__when">{formatStamp(entry.at)}</span>
                <span>
                  {entry.field}: {entry.from ?? '—'} → {entry.to ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
