/**
 * Spreadsheet parsing — BRIEF §7.8, SCHEMA.md.
 *
 * The file is read entirely in the browser. Nothing is uploaded, because there
 * is nowhere to upload it to.
 *
 * Two things here are not obvious and both come straight from the real file:
 *
 *  1. **Read the Excel Table, not the used range.** The pack is a queryTable
 *     named `Job_pack` over A1:I443. Columns J-N are empty but carry
 *     formatting, so a naive reader reports 14 columns and five phantom fields.
 *
 *  2. **Every cell is read as text.** `Circuit` holds telephone numbers, and a
 *     numeric coercion silently eats the leading `0`. `raw: false` plus
 *     `defval: ''` gets formatted strings; the seq column is parsed back to a
 *     number explicitly, because it is the only genuine integer.
 */
import type * as XLSXTypes from 'xlsx';
type WorkBook = XLSXTypes.WorkBook;
type WorkSheet = XLSXTypes.WorkSheet;

export interface ParsedSheet {
  readonly sheetName: string;
  readonly headers: string[];
  readonly rows: Array<Record<string, string>>;
  /** True when the rows came from a named Excel Table rather than the used range. */
  readonly fromTable: boolean;
  readonly tableName: string | null;
}

/**
 * SheetJS is ~900KB and is only needed on the import and export screens, so it
 * is dynamically imported (D6). The service worker precaches the chunk, so this
 * still resolves in aeroplane mode.
 */
export async function loadSheetJs(): Promise<typeof XLSXTypes> {
  return import('xlsx');
}

/**
 * Strip a leading apostrophe — SCHEMA.md "Import gotchas".
 *
 * The equipment cells contain a literal `'` in the value itself, not merely an
 * Excel quote-prefix flag, so nothing upstream removes it for us.
 *
 * Only the ends are trimmed: the LLU tie formats contain meaningful internal
 * spaces.
 */
export function cleanCell(value: unknown): string {
  if (value == null) return '';
  let text = typeof value === 'string' ? value : String(value);
  text = text.trim();
  if (text.startsWith("'")) text = text.slice(1).trim();
  return text;
}

interface TableRange {
  readonly name: string;
  readonly ref: string;
}

/**
 * Find the Excel Table definition on a sheet.
 *
 * SheetJS exposes tables inconsistently across versions and file shapes, so try
 * the documented places and fall back to the used range rather than failing —
 * a pack that does not use a table must still import.
 */
function findTable(workbook: WorkBook, sheetName: string): TableRange | null {
  const sheet = workbook.Sheets[sheetName] as (WorkSheet & { '!tables'?: unknown }) | undefined;
  if (!sheet) return null;

  const candidates: unknown[] = [];
  const sheetTables = sheet['!tables'];
  if (Array.isArray(sheetTables)) candidates.push(...sheetTables);

  const workbookTables = (workbook as WorkBook & { Tables?: unknown }).Tables;
  if (Array.isArray(workbookTables)) candidates.push(...workbookTables);

  for (const candidate of candidates) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;
    const ref = record.ref ?? record.Ref ?? record.range;
    const name = record.name ?? record.Name ?? record.displayName;
    if (typeof ref === 'string' && /^[A-Z]+\d+:[A-Z]+\d+$/.test(ref)) {
      return { name: typeof name === 'string' ? name : 'table', ref };
    }
  }

  return null;
}

/**
 * Trim a range to the columns that actually have a header.
 *
 * This is the fallback for when the table definition is not readable: J-N are
 * empty but formatted, and their header cells are blank, so dropping
 * header-less columns achieves the same result as reading the table.
 */
function trimToHeaderedColumns(
  headers: string[],
  rows: Array<Record<string, string>>,
): { headers: string[]; rows: Array<Record<string, string>> } {
  const kept = headers.filter((header) => header.trim() !== '');
  const trimmedRows = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const header of kept) out[header] = row[header] ?? '';
    return out;
  });
  return { headers: kept, rows: trimmedRows };
}

/** Drop rows where every cell is empty — trailing formatted rows are common. */
function dropEmptyRows(rows: Array<Record<string, string>>): Array<Record<string, string>> {
  return rows.filter((row) => Object.values(row).some((value) => value !== ''));
}

export async function parseWorkbook(file: ArrayBuffer): Promise<ParsedSheet> {
  const XLSX = await loadSheetJs();

  const workbook = XLSX.read(file, {
    type: 'array',
    // cellText/cellDates off, raw handled per-sheet below. We never want dates
    // coerced — nothing in this pack is a date, and a coerced one would be lost.
    cellDates: false,
    cellNF: false,
    cellStyles: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (sheetName === undefined) throw new ImportError('That file has no worksheets.');

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new ImportError(`Could not read the sheet "${sheetName}".`);

  const table = findTable(workbook, sheetName);

  // raw:false + defval:'' gives formatted strings for every cell, which is what
  // keeps a leading 0 on a telephone number.
  const options = {
    raw: false,
    defval: '',
    blankrows: false,
    ...(table !== null ? { range: table.ref } : {}),
  } as const;

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, options);

  if (records.length === 0) {
    throw new ImportError('That sheet has a header row but no job rows.');
  }

  // Header order matters: export must round-trip in the source column order.
  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    ...(table !== null ? { range: table.ref } : {}),
  })[0];

  const rawHeaders = (headerRow ?? Object.keys(records[0] ?? {})).map((h) => String(h).trim());

  const rawRows = records.map((record) => {
    const row: Record<string, string> = {};
    for (const header of rawHeaders) {
      if (header === '') continue;
      row[header] = cleanCell(record[header]);
    }
    return row;
  });

  const trimmed = trimToHeaderedColumns(rawHeaders, rawRows);
  const rows = dropEmptyRows(trimmed.rows);

  if (rows.length === 0) {
    throw new ImportError('That sheet has a header row but no job rows.');
  }

  return {
    sheetName,
    headers: trimmed.headers,
    rows,
    fromTable: table !== null,
    tableName: table?.name ?? null,
  };
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
