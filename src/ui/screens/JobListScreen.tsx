/**
 * The home screen — BRIEF §7.3, §7.4, §7.5.
 *
 * Cards on a phone, the full table at >=900px, over the same store. Filter,
 * sort and search compose and are persisted, so relaunching mid-job puts him
 * back exactly where he was.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { STATUS_LABELS } from '../../data/transitions';
import type { Job, JobStatus, JobType, StatusFilter } from '../../data/types';
import { applyView, countJobs, JOB_TYPE_LABELS, sortFieldLabel } from '../../data/view';
import { headerForRole } from '../../import/columns';
import { signOffPending, toggleJobDone } from '../../state/actions';
import { activePack, setState, updateView, type AppState } from '../../state/store';
import { ChipRow } from '../components/ChipRow';
import { JobCard } from '../components/JobCard';
import { SearchIcon, SortIcon, CrossIcon, ImportIcon, ExportIcon } from '../components/Icons';
import { SortSheet } from '../components/SortSheet';
import { VirtualList } from '../components/VirtualList';
import { JobTable } from '../components/JobTable';
import { ExportSheet } from '../components/ExportSheet';

const SEARCH_DEBOUNCE_MS = 120;

// Four chips, not seven. He asked for done / not done; 'pending' and
// 'signed-off' are where a done job sits before and after the batch (D17).
const STATUS_CHIPS: StatusFilter[] = ['all', 'outstanding', 'pending', 'signed-off'];

export function JobListScreen({ state }: { state: AppState }) {
  const pack = activePack();
  const view = state.vault?.settings.view;

  const scroller = useRef<HTMLDivElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Debounced so typing stays responsive; 120ms, no more (BRIEF §7.5).
  const [searchDraft, setSearchDraft] = useState(view?.search ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchDraft !== (view?.search ?? '')) updateView({ search: searchDraft });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, view?.search]);

  const oldEquipColumn = pack ? headerForRole(pack.columnMapping, 'oldEquipment') : null;

  const { jobs, groups } = useMemo(() => {
    if (pack === null || view === undefined) return { jobs: [] as Job[], groups: [] };
    return applyView(pack.jobs, view, oldEquipColumn);
  }, [pack, view, oldEquipColumn]);

  const counts = useMemo(() => {
    if (pack === null || view === undefined) return null;
    return countJobs(pack.jobs, view.search);
  }, [pack, view?.search]);

  // Changing the sort or the grouping invalidates his place in the list: the
  // rows under the current scroll offset are now a different set of jobs. Going
  // back to the top is the only honest response — anything else drops him
  // somewhere arbitrary, which is the opposite of "never hunt for your place".
  useEffect(() => {
    // The page is the scroller, not `.list` — see VirtualList.
    window.scrollTo({ top: 0 });
  }, [view?.sortField, view?.sortDirection, view?.group]);

  /*
   * There is deliberately no auto-scroll after a tap (D17).
   *
   * The old three-gate model moved a job out of the filtered list when it was
   * marked, so the list was scrolled to keep his place. One tap now just turns
   * the card blue and leaves it where it is — and when he is filtered to Not
   * done, the ticked job leaves the list and the next one takes its position on
   * its own. Scrolling on top of that only moved the list under his thumb,
   * which is what he reported.
   */

  if (pack === null || view === undefined || counts === null) {
    return (
      <div class="empty">
        <p class="empty__title">No job pack yet</p>
        <p>Import this week&rsquo;s spreadsheet to get started.</p>
        <button
          type="button"
          class="button button--primary"
          onClick={() => setState({ screen: { name: 'import' } })}
        >
          <ImportIcon size={20} />
          Import a job pack
        </button>
      </div>
    );
  }

  const columns = {
    circuit: headerForRole(pack.columnMapping, 'circuit'),
    oldEquipment: headerForRole(pack.columnMapping, 'oldEquipment'),
    esideTies: headerForRole(pack.columnMapping, 'esideTies'),
    dsideTies: headerForRole(pack.columnMapping, 'dsideTies'),
  };

  // The pending pile: ticked at the frame, not yet signed off.
  const pendingCount = pack.jobs.filter((job) => job.progress.doneAt !== null && job.progress.signedOffAt === null).length;

  function chipCount(filter: StatusFilter): number {
    if (counts === null) return 0;
    if (filter === 'all') return counts.all;
    if (filter === 'attention') return counts.attention;
    return counts.byStatus[filter as JobStatus];
  }

  function chipLabel(filter: StatusFilter): string {
    if (filter === 'all') return 'All';
    if (filter === 'attention') return 'Needs attention';
    return STATUS_LABELS[filter as JobStatus];
  }

  const frames = Object.keys(counts.byFrame).sort();

  return (
    <>
      <div class="controls">
        <div class="search">
          <SearchIcon size={20} />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="Job, circuit, bar pair, ties"
            aria-label="Search jobs"
            value={searchDraft}
            onInput={(event) => setSearchDraft((event.target as HTMLInputElement).value)}
          />
          {searchDraft !== '' && (
            <button
              type="button"
              class="search__clear"
              aria-label="Clear search"
              onClick={() => setSearchDraft('')}
            >
              <CrossIcon size={18} />
            </button>
          )}
        </div>

        <ChipRow label="Filter by status">
          {STATUS_CHIPS.map((filter) => (
            <button
              key={filter}
              type="button"
              class="chip"
              aria-pressed={view.status === filter}
              onClick={() => updateView({ status: filter })}
            >
              {chipLabel(filter)}
              <span class="chip__count">{chipCount(filter)}</span>
            </button>
          ))}
          {counts.attention > 0 && (
            <button
              type="button"
              class="chip"
              aria-pressed={view.status === 'attention'}
              onClick={() => updateView({ status: 'attention' })}
            >
              Needs attention
              <span class="chip__count">{counts.attention}</span>
            </button>
          )}
        </ChipRow>

        {/*
          Second row: the derived dimensions. They change how long a job takes,
          so they belong next to status rather than buried in a menu.
        */}
        <ChipRow label="Filter by job type and frame">
          {(Object.keys(JOB_TYPE_LABELS) as JobType[]).map((type) => (
            <button
              key={type}
              type="button"
              class="chip"
              aria-pressed={view.jobType === type}
              onClick={() => updateView({ jobType: view.jobType === type ? null : type })}
            >
              {JOB_TYPE_LABELS[type]}
              <span class="chip__count">{counts.byType[type]}</span>
            </button>
          ))}
          {frames.length > 1 &&
            frames.map((frame) => (
              <button
                key={frame}
                type="button"
                class="chip"
                aria-pressed={view.frame === frame}
                onClick={() => updateView({ frame: view.frame === frame ? null : frame })}
              >
                {frame === 'Unplaced' ? 'Unplaced' : `Frame ${frame}`}
                <span class="chip__count">{counts.byFrame[frame]}</span>
              </button>
            ))}
        </ChipRow>

        <div class="sortbar">
          <button type="button" class="sortbar__chip" onClick={() => setSortOpen(true)}>
            <SortIcon size={16} />
            {sortFieldLabel(view.sortField)}
            <span aria-hidden="true">{view.sortDirection === 'asc' ? '↑' : '↓'}</span>
            <span class="visually-hidden">
              {view.sortDirection === 'asc' ? 'ascending' : 'descending'}
            </span>
          </button>
          <span class="sortbar__spacer" />
          <span class="sortbar__meta">
            {jobs.length === pack.jobs.length
              ? `${jobs.length} jobs`
              : `${jobs.length} of ${pack.jobs.length}`}
          </span>
        </div>
      </div>

      <div class="list list--cards" ref={scroller}>
        {jobs.length === 0 && (
          <div class="empty">
            <p class="empty__title">Nothing matches</p>
            <p>Change the filters or clear the search.</p>
          </div>
        )}

        {view.group === 'none' ? (
          <VirtualList
            items={jobs}
            keyFor={(job) => job.id}
            renderItem={(job) => (
              <div data-job-id={job.id}>
                <JobCard job={job} columns={columns} onToggleDone={toggleJobDone} />
              </div>
            )}
          />
        ) : (
          groups.map((group) => (
            <section key={group.key}>
              <header class="group-header">
                <span>{group.label}</span>
                <span class="group-header__count">
                  {group.done} / {group.total}
                </span>
              </header>
              {group.jobs.map((job) => (
                <div key={job.id} data-job-id={job.id}>
                  <JobCard job={job} columns={columns} onToggleDone={toggleJobDone} />
                </div>
              ))}
            </section>
          ))
        )}
      </div>

      {/*
        Rendered AFTER the list, never inside it.
        
        It is `position: fixed`, so its place in the DOM is cosmetic — but it
        used to sit as the first child of `.list`, directly before VirtualList.
        Appearing on the first tap inserted a sibling ahead of the list, Preact
        reconciles children by position, and VirtualList REMOUNTED with its
        window reset to row 0. That is what threw him back up the list
        every time he ticked a job.
      */}
      {pendingCount > 0 && (
        <div
          class={`signoff${state.undo !== null ? ' signoff--above-toast' : ''}`}
          role="status"
        >
          <span class="signoff__count">{pendingCount} done, not signed off</span>
          <button
            type="button"
            class="button button--primary signoff__button"
            onClick={() => signOffPending()}
          >
            Sign off all {pendingCount}
          </button>
        </div>
      )}

      {/* Desktop review only. Same store, same actions. */}
      <JobTable
        jobs={jobs}
        pack={pack}
        view={view}
        onToggleDone={toggleJobDone}
        onSort={(field) =>
          updateView(
            view.sortField === field
              ? { sortDirection: view.sortDirection === 'asc' ? 'desc' : 'asc' }
              : { sortField: field, sortDirection: 'asc' },
          )
        }
      />

      <nav class="dock" aria-label="Main actions">
        <button
          type="button"
          class="dock__button dock__button--primary"
          onClick={() => setSortOpen(true)}
        >
          <SortIcon size={20} />
          Sort
        </button>
        <button
          type="button"
          class="dock__button"
          onClick={() => setState({ screen: { name: 'import' } })}
        >
          <ImportIcon size={20} />
          Import
        </button>
        <button type="button" class="dock__button" onClick={() => setExportOpen(true)}>
          <ExportIcon size={20} />
          Export
        </button>
      </nav>

      {sortOpen && (
        <SortSheet
          view={view}
          pack={pack}
          onChange={(patch) => updateView(patch)}
          onClose={() => setSortOpen(false)}
        />
      )}


      {exportOpen && <ExportSheet pack={pack} onClose={() => setExportOpen(false)} />}
    </>
  );
}
