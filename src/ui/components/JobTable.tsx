/**
 * The full sortable table — BRIEF §7.3: desktop review only, at >=900px.
 *
 * Same data, same store, same actions as the cards. It exists because at a desk
 * a table genuinely is better; it is hidden on a phone because there it is the
 * problem this app was built to fix.
 *
 * Fully keyboard operable (BRIEF §7.11): every header is a button, every row
 * action is a button, in document order.
 */
import { formatBarPair } from '../../data/barPair';
import { currentGate, deriveStatus, STATUS_LABELS } from '../../data/transitions';
import type { Job, Pack, SortField, ViewSpec } from '../../data/types';
import { JOB_TYPE_LABELS } from '../../data/view';
import { headerForRole } from '../../import/columns';
import { formatStampSmart } from './format';
import { CrossIcon, TickIcon } from './Icons';

interface JobTableProps {
  readonly jobs: Job[];
  readonly pack: Pack;
  readonly view: ViewSpec;
  readonly onOpen: (jobId: string) => void;
  readonly onPass: (jobId: string) => void;
  readonly onFail: (jobId: string) => void;
  readonly onSort: (field: SortField) => void;
}

export function JobTable({ jobs, pack, view, onOpen, onPass, onFail, onSort }: JobTableProps) {
  // Two exclusions, both to stop a column appearing twice:
  //   - constant columns are shown once in the pack header, not 442 times
  //   - the columns already rendered as dedicated sortable fields (row number,
  //     job number, bar pair) would otherwise repeat mid-table
  const dedicated = new Set(
    (['seq', 'jobNumber', 'barPair'] as const)
      .map((role) => headerForRole(pack.columnMapping, role))
      .filter((header): header is string => header !== null),
  );

  const sourceColumns = pack.columns.filter(
    (column) => !(column in pack.constantColumns) && !dedicated.has(column),
  );

  function caret(field: SortField) {
    if (view.sortField !== field) return null;
    return <span aria-hidden="true">{view.sortDirection === 'asc' ? '↑' : '↓'}</span>;
  }

  function sortLabel(field: SortField, label: string) {
    if (view.sortField !== field) return `Sort by ${label}`;
    return `Sort by ${label}, currently ${view.sortDirection === 'asc' ? 'ascending' : 'descending'}`;
  }

  return (
    <div class="table-wrap">
      <table class="table">
        <caption class="visually-hidden">
          {pack.name} — {jobs.length} jobs. Every column is sortable.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <button type="button" onClick={() => onSort('seq')} aria-label={sortLabel('seq', 'sheet order')}>
                JOB {caret('seq')}
              </button>
            </th>
            <th scope="col">
              <button
                type="button"
                onClick={() => onSort('jobNumber')}
                aria-label={sortLabel('jobNumber', 'job number')}
              >
                JOB NUMBER {caret('jobNumber')}
              </button>
            </th>
            <th scope="col">
              <button
                type="button"
                onClick={() => onSort('framePosition')}
                aria-label={sortLabel('framePosition', 'frame position')}
              >
                FRAME POSITION {caret('framePosition')}
              </button>
            </th>
            <th scope="col">
              <button
                type="button"
                onClick={() => onSort('jobType')}
                aria-label={sortLabel('jobType', 'job type')}
              >
                TYPE {caret('jobType')}
              </button>
            </th>
            {sourceColumns.map((column) => (
              <th scope="col" key={column}>
                <button
                  type="button"
                  onClick={() => onSort(`source:${column}`)}
                  aria-label={sortLabel(`source:${column}`, column)}
                >
                  {column.toUpperCase()} {caret(`source:${column}`)}
                </button>
              </th>
            ))}
            <th scope="col">VERT</th>
            <th scope="col">UP</th>
            <th scope="col">
              <button
                type="button"
                onClick={() => onSort('status')}
                aria-label={sortLabel('status', 'status')}
              >
                STATUS {caret('status')}
              </button>
            </th>
            <th scope="col">ACTIVATED</th>
            <th scope="col">TESTED</th>
            <th scope="col">COMPLETED</th>
            <th scope="col">NOTES</th>
            <th scope="col">
              <button
                type="button"
                onClick={() => onSort('updatedAt')}
                aria-label={sortLabel('updatedAt', 'last updated')}
              >
                UPDATED {caret('updatedAt')}
              </button>
            </th>
            <th scope="col">
              <span class="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const status = deriveStatus(job.progress);
            const complete = currentGate(job.progress) === null;
            return (
              <tr key={job.id}>
                <td class="mono">{job.seq}</td>
                <td class="mono">
                  <button type="button" onClick={() => onOpen(job.id)}>
                    {job.jobNumber}
                  </button>
                </td>
                <td class="mono">{formatBarPair(job.barPair)}</td>
                <td>{JOB_TYPE_LABELS[job.jobType]}</td>
                {sourceColumns.map((column) => (
                  <td class="mono" key={column}>
                    {job.source[column]}
                  </td>
                ))}
                <td class="mono">{job.progress.vert ?? ''}</td>
                <td class="mono">{job.progress.up ?? ''}</td>
                <td>
                  <span class={`status status--${status}`}>{STATUS_LABELS[status]}</span>
                </td>
                <td class="mono">{formatStampSmart(job.progress.activatedAt)}</td>
                <td class="mono">{formatStampSmart(job.progress.testedAt)}</td>
                <td class="mono">{formatStampSmart(job.progress.completedAt)}</td>
                <td>{job.progress.notes}</td>
                <td class="mono">{formatStampSmart(job.progress.updatedAt)}</td>
                <td>
                  <div class="table__actions">
                    <button
                      type="button"
                      class="table__mark mark--pass"
                      disabled={job.progress.locked || complete}
                      onClick={() => onPass(job.id)}
                      aria-label={`Pass job ${job.jobNumber}`}
                    >
                      <TickIcon size={18} />
                    </button>
                    <button
                      type="button"
                      class="table__mark mark--fail"
                      disabled={job.progress.locked}
                      onClick={() => onFail(job.id)}
                      aria-label={`Fail job ${job.jobNumber}`}
                    >
                      <CrossIcon size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
