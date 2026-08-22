/**
 * Sort and grouping sheet — BRIEF §7.4.
 *
 * Sorting was one of his two explicit asks, so it gets a proper control rather
 * than a hidden menu: pick a field, toggle ascending/descending, and two
 * one-tap presets that matter more than plain A-Z.
 */
import type { GroupMode, Pack, SortDirection, SortField, ViewSpec } from '../../data/types';
import { SORT_FIELD_LABELS } from '../../data/view';
import { Sheet } from './Sheet';
import { TickIcon } from './Icons';

interface SortSheetProps {
  readonly view: ViewSpec;
  readonly pack: Pack;
  readonly onChange: (patch: Partial<ViewSpec>) => void;
  readonly onClose: () => void;
}

const BASE_FIELDS: SortField[] = [
  'framePosition',
  'jobNumber',
  'seq',
  'status',
  'jobType',
  'updatedAt',
];

const GROUP_LABELS: Record<GroupMode, string> = {
  none: 'No grouping',
  block: 'Group by frame / block',
  oldShelf: 'Group by old shelf',
  status: 'Group by status',
};

export function SortSheet({ view, pack, onChange, onClose }: SortSheetProps) {
  // Constant columns are worth zero screen space and zero sort options.
  const sortableSourceColumns = pack.columns.filter(
    (column) => !(column in pack.constantColumns),
  );

  function setField(field: SortField) {
    onChange({ sortField: field });
  }

  function setDirection(direction: SortDirection) {
    onChange({ sortDirection: direction });
  }

  return (
    <Sheet title="Sort and group" onClose={onClose}>
      <div class="sheet__row" style={{ marginBottom: '14px' }}>
        <button
          type="button"
          class="sheet__option"
          style={{ marginBottom: 0 }}
          aria-pressed={view.sortDirection === 'asc'}
          onClick={() => setDirection('asc')}
        >
          Ascending
        </button>
        <button
          type="button"
          class="sheet__option"
          style={{ marginBottom: 0 }}
          aria-pressed={view.sortDirection === 'desc'}
          onClick={() => setDirection('desc')}
        >
          Descending
        </button>
      </div>

      <h3 class="section__title">Sort by</h3>
      {BASE_FIELDS.map((field) => (
        <button
          key={field}
          type="button"
          class="sheet__option"
          aria-pressed={view.sortField === field}
          onClick={() => setField(field)}
        >
          {view.sortField === field ? <TickIcon size={18} /> : <span style={{ width: '18px' }} />}
          {SORT_FIELD_LABELS[field]}
          {field === 'framePosition' && (
            <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.7 }}>
              follows the frame
            </span>
          )}
        </button>
      ))}

      {sortableSourceColumns.length > 0 && (
        <>
          <h3 class="section__title">Sort by a column from the pack</h3>
          {sortableSourceColumns.map((column) => {
            const field: SortField = `source:${column}`;
            return (
              <button
                key={column}
                type="button"
                class="sheet__option"
                aria-pressed={view.sortField === field}
                onClick={() => setField(field)}
              >
                {view.sortField === field ? (
                  <TickIcon size={18} />
                ) : (
                  <span style={{ width: '18px' }} />
                )}
                {column}
              </button>
            );
          })}
        </>
      )}

      <h3 class="section__title">Grouping</h3>
      {(Object.keys(GROUP_LABELS) as GroupMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          class="sheet__option"
          aria-pressed={view.group === mode}
          onClick={() => onChange({ group: mode })}
        >
          {view.group === mode ? <TickIcon size={18} /> : <span style={{ width: '18px' }} />}
          {GROUP_LABELS[mode]}
        </button>
      ))}

      <button type="button" class="button button--primary" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
