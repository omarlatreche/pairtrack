/**
 * Synthetic job pack for e2e — BRIEF §5.2.
 *
 * Same shapes, cardinalities and defects as the real file; every value
 * fabricated. Written to a temp path at test time and deleted afterwards, so
 * no spreadsheet ever exists in the repo (BRIEF §9.8).
 *
 * All references here are fabricated.
 * no-data-scan: synthetic
 */
import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const HEADERS = [
  'JOB',
  'Job Number',
  'DB',
  'Circuit',
  'MDF BAR PAIR',
  'ESIDE TIES',
  'DSIDE TIES',
  'New_Equipment',
  'Old_Equipment',
];

const BLOCKS = ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'N', 'P', 'R', 'S', 'T', 'U', 'W'];
const SHELVES = ['110', '111', '112', '9', '8'];

export interface PackOptions {
  readonly rows?: number;
  readonly phantomColumns?: boolean;
}

export function writeSyntheticPack(outPath: string, options: PackOptions = {}) {
  const { rows: total = 442, phantomColumns = true } = options;
  const rows: string[][] = [];

  for (let i = 1; i <= total; i += 1) {
    const isIntl = i > total - 26;
    const block = isIntl ? 'INTL' : BLOCKS[i % BLOCKS.length];
    const frame = isIntl ? '09' : '01';
    const pair = 100 + ((i * 37) % 4900);
    const isLlu = i === 7 || i === 101 || i === 203;
    const hasTies = i % 2 === 0;

    let eside = '';
    let dside = '';
    if (isLlu) {
      // Internal spaces are meaningful in the LLU format.
      eside = `0LLUB${String(100000 + i).slice(0, 6)} ${20000 + i} I`;
      dside = `LLUB${String(100000 + i).slice(0, 6)} ${20000 + i} O`;
    } else if (hasTies) {
      eside = `02-E-${String(100 + (i % 800)).padStart(3, '0')}-U${String(i % 90).padStart(2, '0')}-${String(i % 900).padStart(3, '0')}`;
      dside = `4-D-${String(200 + (i % 700)).padStart(3, '0')}-U${String(i % 80).padStart(2, '0')}-${String(i % 800).padStart(3, '0')}`;
    }

    const prefix = i % 5 === 0 ? 'QQB' : i % 17 === 0 ? 'QQC' : 'QQA';
    const shelf = SHELVES[i % SHELVES.length];

    // Ofcom's reserved drama range — never allocated to a real subscriber.
    const circuit = `02079460${String(i % 1000).padStart(3, '0')}`;

    const badEquipment = i === 42; // shelf and port ran together, port lost
    const badBarPair = i === total; // a bare 0, as in the real pack's last row

    rows.push([
      String(i),
      `${prefix}${String(100 + (i % 900)).padStart(3, '0')}/3`,
      'LW', // constant across the whole pack
      circuit,
      badBarPair ? '0' : `${frame}/${block}${pair}`,
      eside,
      dside,
      `'250.${String(1000 + i).slice(0, 4)}`, // literal leading apostrophe
      badEquipment
        ? `'${shelf}${String(1000 + i).slice(0, 4)}.`
        : `'${shelf}.${String(1000 + i).slice(0, 4)}`,
    ]);
  }

  // Five empty-but-formatted trailing columns, as the real file has (J-N).
  const pad = phantomColumns ? ['', '', '', '', ''] : [];
  const aoa = [[...HEADERS, ...pad], ...rows.map((row) => [...row, ...pad])];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '<exchange redacted> - TEST');

  writeFileSync(outPath, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  return { path: outPath, rows: total };
}

/** The job number the generator produces for a given row, for assertions. */
export function jobNumberForRow(i: number): string {
  const prefix = i % 5 === 0 ? 'QQB' : i % 17 === 0 ? 'QQC' : 'QQA';
  return `${prefix}${String(100 + (i % 900)).padStart(3, '0')}/3`;
}
