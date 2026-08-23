/**
 * Getting data out — BRIEF §7.9.
 *
 * Not a reporting feature. This is the only route his work takes to the office,
 * so it is core plumbing: the export must arrive in a shape they already
 * recognise, which means the nine source columns in the source order, verbatim,
 * with the progress columns appended after them.
 *
 * Everything is generated in the browser and handed to the OS. Nothing is
 * transmitted, because there is nowhere to transmit it to.
 */
import { formatStamp } from '../ui/components/format';
import { deriveStatus, STATUS_LABELS } from '../data/transitions';
import type { Job, Pack } from '../data/types';
import { loadSheetJs } from '../import/parse';

/**
 * Progress columns, appended after the source columns.
 *
 * Named to match the tool he already uses (reference/README.md), so the office
 * sees the headings they expect rather than new ones invented here.
 */
const PROGRESS_COLUMNS = [
  'VERT',
  'UP',
  'READY TO ACTIVATE',
  'ACTIVATION TIMESTAMP',
  'TEST STATUS',
  'TEST TIMESTAMP',
  'NOTES',
  'COMPLETED BY',
  'TIMESTAMP',
  'STATUS',
] as const;

/**
 * Only two of these carry a value now (D17).
 *
 * The engineer marks done or not done, and said the completed timestamp is the
 * only one that matters. So `TIMESTAMP`, `COMPLETED BY` and `STATUS` are
 * written and the rest go out blank.
 *
 * The blank columns are kept rather than removed so the office's sheet keeps
 * exactly the shape it has today — dropping columns is the kind of change that
 * breaks somebody else's process without warning.
 *
 * They are NOT filled in with `Yes` / `Pass`. That would make the sheet look
 * complete, but it would assert an activation and a test that nobody performed,
 * on a telecoms record. Blank is the honest answer until the office says what
 * they actually need. See D17, "Open with the office".
 */
function progressValues(job: Job): Record<string, string> {
  const p = job.progress;
  return {
    VERT: '',
    UP: '',
    'READY TO ACTIVATE': '',
    'ACTIVATION TIMESTAMP': '',
    'TEST STATUS': '',
    'TEST TIMESTAMP': '',
    NOTES: '',
    'COMPLETED BY': p.completedBy ?? '',
    TIMESTAMP: formatStamp(p.doneAt),
    STATUS: STATUS_LABELS[deriveStatus(p)],
  };
}

/** Header row + data rows, in the exact order the office expects. */
export function buildExportRows(
  pack: Pack,
  jobs: Job[],
): { headers: string[]; rows: string[][] } {
  // Source columns verbatim and in sheet order, so the file round-trips.
  const headers = [...pack.columns, ...PROGRESS_COLUMNS];

  const rows = jobs.map((job) => {
    const progress = progressValues(job);
    return headers.map((header) =>
      header in progress ? (progress[header] ?? '') : (job.source[header] ?? ''),
    );
  });

  return { headers, rows };
}

function timestampForFileName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function exportFileName(pack: Pack, extension: string): string {
  const base = pack.name.replace(/[^\w\-. ]+/g, '').trim() || 'pairtrack';
  return `${base} - ${timestampForFileName()}.${extension}`;
}

export async function buildXlsx(
  pack: Pack,
  jobs: Job[],
): Promise<Blob> {
  const XLSX = await loadSheetJs();
  const { headers, rows } = buildExportRows(pack, jobs);

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Belt and braces on the leading zero of a telephone number.
  //
  // The real protection is that buildExportRows returns strings throughout, so
  // aoa_to_sheet already types every cell as `s`. This loop makes that explicit
  // and adds the text number-format. Note that `z` is dropped on write by this
  // version of SheetJS — verified — so do not remove the string typing on the
  // assumption that the format is what is doing the work. It is not.
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address] as { t?: string; z?: string } | undefined;
      if (cell !== undefined) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Job_pack');

  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** RFC 4180 quoting: a note with a comma or a newline must survive the trip. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsv(pack: Pack, jobs: Job[], ): Blob {
  const { headers, rows } = buildExportRows(pack, jobs);
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));

  // A BOM, so Excel opens it as UTF-8 rather than mangling anything non-ASCII.
  const text = `\uFEFF${lines.join('\r\n')}\r\n`;
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}

/**
 * Hand the file to the OS.
 *
 * Tries the share sheet first, because on a phone that is what puts the file
 * into WhatsApp or an email to the office in one step. Falls back to a
 * download, which is what a desktop browser wants.
 */
export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled';

export async function deliverFile(blob: Blob, fileName: string): Promise<DeliveryResult> {
  const file = new File([blob], fileName, { type: blob.type });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (error) {
      // Cancelling the share sheet is not a failure, but it is emphatically not
      // a success either — no file exists afterwards. Reporting it as 'shared'
      // made the app mark a backup as taken when none had been, which is the
      // worst possible thing to be wrong about: he would find out on the day he
      // needed it. Say cancelled and let the caller decide.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
