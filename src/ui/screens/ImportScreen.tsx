/**
 * Import — BRIEF §7.8.
 *
 * File picker → parse in the browser → column mapping → merge preview →
 * confirm. Nothing commits until he has seen exactly what will happen to the
 * progress he already has.
 *
 * The xlsx parse is the one operation in this app allowed to show a spinner
 * (BRIEF §3.5).
 */
import { useState } from 'preact/hooks';
import { COLUMN_ROLE_LABELS, type ColumnRole, type Pack } from '../../data/types';
import { buildJobs } from '../../import/buildJobs';
import { detectConstantColumns, detectRoles, headerForRole } from '../../import/columns';
import {
  describeMerge,
  findMergeTarget,
  makePackId,
  mergeJobs,
  packNameFromFile,
  previewMerge,
  type MergePreview,
} from '../../import/merge';
import { ImportError, parseWorkbook, type ParsedSheet } from '../../import/parse';
import { commit, getState, setState } from '../../state/store';
import { flushSave } from '../../data/repository';
import { JOB_TYPE_LABELS } from '../../data/view';
import { BackIcon, ImportIcon, WarnIcon } from '../components/Icons';
import type { Job } from '../../data/types';

type Stage = 'pick' | 'map' | 'preview' | 'done';

const ROLE_OPTIONS: ColumnRole[] = [
  'jobNumber',
  'barPair',
  'circuit',
  'esideTies',
  'dsideTies',
  'newEquipment',
  'oldEquipment',
  'seq',
  'other',
];

export function ImportScreen() {
  const packs = getState().vault?.packs ?? [];
  const [stage, setStage] = useState<Stage>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, ColumnRole | null>>({});
  const [built, setBuilt] = useState<{ jobs: Job[]; types: Record<string, number> } | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  /** '' means "a new pack"; otherwise the id of the pack to update. */
  const [targetId, setTargetId] = useState<string>('');
  const [summary, setSummary] = useState('');

  async function onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file === undefined) return;

    setBusy(true);
    setError(null);

    try {
      const bytes = await file.arrayBuffer();
      const parsed = await parseWorkbook(bytes);

      setSheet(parsed);
      setFileName(file.name);

      // Remember the mapping per pack name, so next week is one tap.
      const packName = packNameFromFile(file.name);
      const existing = findMergeTarget(getState().vault?.packs ?? [], packName);
      setMapping(existing?.columnMapping ?? detectRoles(parsed.headers));

      setStage('map');
    } catch (caught) {
      setError(
        caught instanceof ImportError
          ? caught.message
          : 'Could not read that file. Is it the job-pack spreadsheet?',
      );
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  function toPreview() {
    if (sheet === null) return;

    if (headerForRole(mapping, 'jobNumber') === null) {
      setError('Pick which column holds the job number — it is the key that keeps your progress.');
      return;
    }

    setError(null);
    const now = new Date().toISOString();
    const result = buildJobs(sheet.rows, sheet.headers, mapping, now);

    const packName = packNameFromFile(fileName);
    const existingPack = findMergeTarget(getState().vault?.packs ?? [], packName);

    setBuilt({ jobs: result.jobs, types: result.typeCounts });
    setTargetId(existingPack?.id ?? '');
    setPreview(previewMerge(existingPack?.jobs ?? [], result.jobs));
    setStage('preview');
  }

  /**
   * Which pack this import lands in — his choice, not a guess from the filename.
   *
   * Matching on the filename stem alone gets it wrong in both directions: the
   * office re-sending a corrected file as "… (1).xlsx" would start a new pack
   * and strand every tick, while a genuinely new week's pack that happened to
   * keep the same name would merge into the old one. Neither is silent — the
   * preview shows the numbers — but until this existed there was no way to
   * redirect it, and his only remedy was renaming a file on a phone.
   */
  function retarget(id: string) {
    if (built === null) return;
    setTargetId(id);
    const pack = packs.find((candidate) => candidate.id === id) ?? null;
    setPreview(previewMerge(pack?.jobs ?? [], built.jobs));
  }

  async function confirm() {
    if (sheet === null || built === null) return;

    const now = new Date().toISOString();
    const packName = packNameFromFile(fileName);
    const constantColumns = detectConstantColumns(sheet.rows, sheet.headers);
    const target = packs.find((candidate) => candidate.id === targetId) ?? null;

    commit((vault) => {
      if (target !== null) {
        const merged: Pack = {
          ...target,
          columns: sheet.headers,
          constantColumns,
          columnMapping: mapping,
          lastImportedAt: now,
          jobs: mergeJobs(target.jobs, built.jobs, now),
        };
        return {
          ...vault,
          activePackId: merged.id,
          packs: vault.packs.map((pack) => (pack.id === merged.id ? merged : pack)),
        };
      }

      const fresh: Pack = {
        id: makePackId(packName, now),
        name: packName,
        columns: sheet.headers,
        constantColumns,
        columnMapping: mapping,
        importedAt: now,
        lastImportedAt: now,
        originalFileName: fileName,
        jobs: built.jobs,
      };
      return { ...vault, activePackId: fresh.id, packs: [...vault.packs, fresh] };
    });

    // Write it through NOW rather than leaving it in the 500ms debounce window.
    //
    // The debounce is right for ticking jobs — that is a stream of small
    // changes. An import is one big, rare change that is expensive to redo, and
    // a crash or a force-quit in that half-second would lose the whole pack.
    // Saying "Imported" before it is actually on disk would also be a lie.
    setBusy(true);
    try {
      await flushSave();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Imported, but could not save: ${caught.message}`
          : 'Imported, but could not save to this device.',
      );
      setBusy(false);
      return;
    }
    setBusy(false);

    setSummary(
      `${built.jobs.length} jobs imported. ${Object.entries(built.types)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${JOB_TYPE_LABELS[type as keyof typeof JOB_TYPE_LABELS]}`)
        .join(', ')}.`,
    );
    setStage('done');
  }

  const defectCount = built?.jobs.filter((job) => job.defects.length > 0).length ?? 0;

  return (
    <div class="panel">
      <button
        type="button"
        class="button"
        style={{ marginBottom: '16px' }}
        onClick={() => setState({ screen: { name: 'list' } })}
      >
        <BackIcon size={20} />
        Back
      </button>

      <h1 style={{ marginTop: 0, fontSize: '22px' }}>Import a job pack</h1>

      {error !== null && (
        <div class="callout callout--danger" role="alert">
          <strong>Could not import</strong>
          <p>{error}</p>
        </div>
      )}

      {stage === 'pick' && (
        <>
          <div class="callout callout--info">
            <strong>This file is read on your phone</strong>
            <p>Nothing is uploaded. There is no server to upload it to.</p>
          </div>

          <label class="dropzone">
            <ImportIcon size={32} />
            <strong>Choose the spreadsheet</strong>
            <span style={{ color: 'var(--text-dim)', fontSize: '14px' }}>.xlsx, .xlsm or .csv</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.xlsb,.xls,.csv"
              class="visually-hidden"
              onChange={(event) => void onFile(event)}
            />
          </label>

          {busy && (
            <div class="empty">
              <div class="spinner" />
              <p>Reading the spreadsheet…</p>
            </div>
          )}
        </>
      )}

      {stage === 'map' && sheet !== null && (
        <>
          <div class="callout">
            <strong>{fileName}</strong>
            <p>
              {sheet.rows.length} rows, {sheet.headers.length} columns
              {sheet.fromTable && sheet.tableName !== null
                ? ` — read from the “${sheet.tableName}” table`
                : ''}
            </p>
          </div>

          <h2 class="section__title">Check the columns</h2>
          <p class="field__hint" style={{ marginBottom: '12px' }}>
            These were detected automatically. Correct anything that is wrong — the job number is
            the key that keeps your progress when you re-import next week.
          </p>

          {sheet.headers.map((header) => (
            <div class="mapping-row" key={header}>
              <span class="mapping-row__header">{header}</span>
              <select
                class="select"
                value={mapping[header] ?? 'other'}
                aria-label={`Role for column ${header}`}
                onChange={(event) =>
                  setMapping({
                    ...mapping,
                    [header]: (event.target as HTMLSelectElement).value as ColumnRole,
                  })
                }
              >
                {ROLE_OPTIONS.map((role) => (
                  <option value={role} key={role}>
                    {COLUMN_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <button type="button" class="button button--primary" style={{ marginTop: '20px' }} onClick={toPreview}>
            Continue
          </button>
        </>
      )}

      {stage === 'preview' && preview !== null && built !== null && (
        <>
          <h2 class="section__title">Before anything changes</h2>

          {packs.length > 0 && (
            <label class="field">
              <span class="field__label">Where should this go?</span>
              <select
                class="select"
                value={targetId}
                onChange={(event) => retarget((event.target as HTMLSelectElement).value)}
              >
                <option value="">Start a new pack</option>
                {packs.map((pack) => (
                  <option value={pack.id} key={pack.id}>
                    Update “{pack.name}” ({pack.jobs.length} jobs)
                  </option>
                ))}
              </select>
              <p class="field__hint">
                Updating keeps every tick on the jobs that match by job number.
              </p>
            </label>
          )}

          <div class="callout callout--info">
            <strong>
              {targetId === ''
                ? 'New pack'
                : `Updating “${packs.find((p) => p.id === targetId)?.name ?? ''}”`}
            </strong>
            <p>{describeMerge(preview)}</p>
          </div>

          <div class="callout">
            <strong>Job types</strong>
            <p>
              {Object.entries(built.types)
                .map(
                  ([type, count]) =>
                    `${count} ${JOB_TYPE_LABELS[type as keyof typeof JOB_TYPE_LABELS]}`,
                )
                .join(' · ')}
            </p>
          </div>

          {defectCount > 0 && (
            <div class="callout callout--warn">
              <strong>
                <WarnIcon size={16} /> {defectCount} row{defectCount === 1 ? '' : 's'} need
                attention
              </strong>
              <p>
                They will import and be flagged, not dropped. You can correct the values on the
                job itself.
              </p>
            </div>
          )}

          <button
            type="button"
            class="button button--primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Saving…' : `Import ${built.jobs.length} jobs`}
          </button>
          <button type="button" class="button" onClick={() => setStage('map')}>
            Back to the columns
          </button>
        </>
      )}

      {stage === 'done' && (
        <>
          <div class="callout callout--info">
            <strong>Imported</strong>
            <p>{summary}</p>
          </div>

          <div class="callout callout--warn">
            <strong>Take a backup now</strong>
            <p>
              An encrypted backup is safe to email or keep in iCloud, and it is the only way back
              if this phone is lost. Export → Encrypted backup.
            </p>
          </div>

          <button
            type="button"
            class="button button--primary"
            onClick={() => setState({ screen: { name: 'list' } })}
          >
            Go to the jobs
          </button>
        </>
      )}
    </div>
  );
}
