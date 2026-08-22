/**
 * Synthetic job pack — BRIEF §5.2.
 *
 * Same shapes, same cardinalities, same defects as the real file. Every value
 * is fabricated. The real pack is 442 real customer telephone numbers and never
 * goes near this repository, so `reference/SCHEMA.md` is the only source used
 * to build this.
 *
 * Deliberate departures from the real values so nothing here can be mistaken
 * for pack data:
 *   - job prefixes are QQA / QQB / QQC, not the real ones
 *   - circuit numbers use the reserved 020 7946 0xxx Ofcom drama range
 *   - block letters and shelf numbers are invented
 *
 * The two real defects from SCHEMA.md are reproduced exactly:
 *   1. one row with a malformed Old_Equipment value (`########.`, port lost)
 *   2. one row (the last) whose MDF BAR PAIR is a bare `0`
 *
 * All references in this file are fabricated.
 * no-data-scan: synthetic
 */

export const HEADERS = [
  'JOB',
  'Job Number',
  'DB',
  'Circuit',
  'MDF BAR PAIR',
  'ESIDE TIES',
  'DSIDE TIES',
  'New_Equipment',
  'Old_Equipment',
] as const;

/** Blocks on frame 01, mirroring the real pack's 17 blocks with gaps. */
const BLOCKS = ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'N', 'P', 'R', 'S', 'T', 'U', 'W'];

/** Five old shelves, as in the real pack. */
const OLD_SHELVES = ['110', '111', '112', '9', '8'];

const NEW_SHELF = '250';

export interface SyntheticOptions {
  /** Total job rows. The real pack is 442. */
  readonly rows?: number;
  /** Include the two malformed rows from SCHEMA.md. */
  readonly withDefects?: boolean;
  /** Add five empty-but-formatted trailing columns, as the real file has (J-N). */
  readonly withPhantomColumns?: boolean;
  /** Prefix a literal apostrophe to equipment values, as the real file does. */
  readonly withLeadingApostrophes?: boolean;
  /**
   * Give one header a trailing space, as a Power Query source easily can.
   * This silently emptied the whole column before the importer read cells by
   * index instead of by header name.
   */
  readonly headerWithTrailingSpace?: string;
  /** Repeat a header name, which sheet_to_json would rename behind your back. */
  readonly duplicateHeader?: string;
}

/**
 * Build rows as an array of header->string records: the shape `parseWorkbook`
 * produces, so builder tests can skip SheetJS entirely.
 */
export function syntheticRows(options: SyntheticOptions = {}): Array<Record<string, string>> {
  const {
    rows = 442,
    withDefects = true,
    withPhantomColumns = false,
    withLeadingApostrophes = true,
  } = options;

  const out: Array<Record<string, string>> = [];
  const apostrophe = withLeadingApostrophes ? "'" : '';

  // Frame 09 / INTL gets the last 26 rows, matching the real 415 / 26 split.
  const intlFrom = Math.max(1, rows - 26);

  for (let i = 1; i <= rows; i += 1) {
    const isIntl = i > intlFrom;
    const block = isIntl ? 'INTL' : (BLOCKS[i % BLOCKS.length] as string);
    const frame = isIntl ? '09' : '01';
    const pairNumber = 100 + ((i * 37) % 4900);

    // Roughly half the pack has ties, as in the real file.
    const hasTies = i % 2 === 0;
    const isLlu = i === 7 || i === 101 || i === 203; // three LLU rows

    let eside = '';
    let dside = '';
    if (isLlu) {
      // LLU format keeps meaningful internal spaces.
      eside = `0LLUB${String(100000 + i).slice(0, 6)} ${String(20000 + i)} I`;
      dside = `LLUB${String(100000 + i).slice(0, 6)} ${String(20000 + i)} O`;
    } else if (hasTies) {
      eside = `02-E-${String(100 + (i % 800)).padStart(3, '0')}-U${String(i % 90).padStart(2, '0')}-${String(i % 900).padStart(3, '0')}`;
      dside = `4-D-${String(200 + (i % 700)).padStart(3, '0')}-U${String(i % 80).padStart(2, '0')}-${String(i % 800).padStart(3, '0')}`;
    }

    const prefix = i % 5 === 0 ? 'QQB' : i % 17 === 0 ? 'QQC' : 'QQA';
    const oldShelf = OLD_SHELVES[i % OLD_SHELVES.length] as string;

    // Ofcom's reserved drama range — never allocated to a real subscriber.
    const circuit = `02079460${String(i % 1000).padStart(3, '0')}`;

    const isBadEquipmentRow = withDefects && i === 42;
    const isBadBarPairRow = withDefects && i === rows;

    const row: Record<string, string> = {
      JOB: String(i),
      'Job Number': `${prefix}${String(100 + (i % 900)).padStart(3, '0')}/3`,
      DB: 'LW', // constant across the whole pack, as in the real file
      Circuit: circuit,
      'MDF BAR PAIR': isBadBarPairRow ? '0' : `${frame}/${block}${pairNumber}`,
      'ESIDE TIES': eside,
      'DSIDE TIES': dside,
      New_Equipment: `${apostrophe}${NEW_SHELF}.${String(1000 + i).slice(0, 4)}`,
      Old_Equipment: isBadEquipmentRow
        // The real defect: shelf and port ran together, port segment lost.
        ? `${apostrophe}${oldShelf}${String(1000 + i).slice(0, 4)}.`
        : `${apostrophe}${oldShelf}.${String(1000 + i).slice(0, 4)}`,
    };

    if (withPhantomColumns) {
      // J-N: present, formatted, empty. A naive reader sees 14 columns.
      for (const phantom of ['', ' ', '  ', '   ', '    ']) row[phantom] = '';
    }

    out.push(row);
  }

  return out;
}

export function syntheticHeaders(
  withPhantomColumns = false,
  options: Pick<SyntheticOptions, 'headerWithTrailingSpace' | 'duplicateHeader'> = {},
): string[] {
  let headers: string[] = [...HEADERS];

  if (options.headerWithTrailingSpace !== undefined) {
    const target = options.headerWithTrailingSpace;
    headers = headers.map((h) => (h === target ? `${h} ` : h));
  }

  if (options.duplicateHeader !== undefined) headers.push(options.duplicateHeader);
  if (withPhantomColumns) headers.push('', ' ', '  ', '   ', '    ');
  return headers;
}

/**
 * Write the synthetic rows to real xlsx bytes, so the parser is tested against
 * a genuine workbook rather than a hand-made object.
 */
export async function syntheticWorkbookBytes(options: SyntheticOptions = {}): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const headers = syntheticHeaders(options.withPhantomColumns, options);
  const rows = syntheticRows(options);

  // Values are looked up by the TRIMMED header, so a deliberately untidy
  // header still gets its real column data written into the sheet.
  const aoa: unknown[][] = [
    headers,
    ...rows.map((row) => headers.map((h) => row[h.trim()] ?? row[h] ?? '')),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '<exchange redacted> - TEST');

  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}
