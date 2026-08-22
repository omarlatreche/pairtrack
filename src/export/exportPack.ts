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
import { failReasonLabel } from '../data/failReasons';
import { deriveStatus, STATUS_LABELS } from '../data/transitions';
import type { FailReason, Job, Pack } from '../data/types';
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
  'FAIL REASON',
] as const;

function progressValues(job: Job, failReasons: FailReason[]): Record<string, string> {
  const p = job.progress;
  return {
    VERT: p.vert ?? '',
    UP: p.up ?? '',
    'READY TO ACTIVATE': p.readyToActivate === 'yes' ? 'Yes' : p.readyToActivate === 'failed' ? 'Failed' : '',
    'ACTIVATION TIMESTAMP': formatStamp(p.activatedAt),
    'TEST STATUS': p.testStatus === 'pass' ? 'Pass' : p.testStatus === 'fail' ? 'Fail' : '',
    'TEST TIMESTAMP': formatStamp(p.testedAt),
    NOTES: p.notes,
    'COMPLETED BY': p.completedBy ?? '',
    TIMESTAMP: formatStamp(p.completedAt),
    STATUS: STATUS_LABELS[deriveStatus(p)],
    'FAIL REASON': failReasonLabel(failReasons, p.failReason),
  };
}

/** Header row + data rows, in the exact order the office expects. */
export function buildExportRows(
  pack: Pack,
  jobs: Job[],
  failReasons: FailReason[],
): { headers: string[]; rows: string[][] } {
  // Source columns verbatim and in sheet order, so the file round-trips.
  const headers = [...pack.columns, ...PROGRESS_COLUMNS];

  const rows = jobs.map((job) => {
    const progress = progressValues(job, failReasons);
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
  failReasons: FailReason[],
): Promise<Blob> {
  const XLSX = await loadSheetJs();
  const { headers, rows } = buildExportRows(pack, jobs, failReasons);

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

export function buildCsv(pack: Pack, jobs: Job[], failReasons: FailReason[]): Blob {
  const { headers, rows } = buildExportRows(pack, jobs, failReasons);
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
export async function deliverFile(blob: Blob, fileName: string): Promise<'shared' | 'downloaded'> {
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
      // A cancelled share is not a failure; fall through to the download so he
      // is never left with nothing.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
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
