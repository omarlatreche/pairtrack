/**
 * Column role detection — BRIEF §7.8.
 *
 * Auto-detect by fuzzy header match, then show a mapping screen so he can
 * correct anything. The mapping is remembered per pack name, so next week is
 * one tap.
 *
 * Nothing here hard-codes this pack's headers as a requirement — a header the
 * matcher does not recognise is carried through verbatim as `other`, never
 * dropped.
 */
import type { ColumnRole } from '../data/types';

/** Patterns tried in order; first match wins. */
const ROLE_PATTERNS: ReadonlyArray<{ role: ColumnRole; test: RegExp }> = [
  { role: 'jobNumber', test: /^job\s*(number|no|ref)/ },
  { role: 'barPair', test: /bar\s*pair|mdf/ },
  { role: 'esideTies', test: /^e[\s-]*side/ },
  { role: 'dsideTies', test: /^d[\s-]*side/ },
  { role: 'newEquipment', test: /new[\s_-]*equip/ },
  { role: 'oldEquipment', test: /old[\s_-]*equip/ },
  { role: 'circuit', test: /circuit|telephone|^tel$|^cli$|^dn$/ },
  { role: 'seq', test: /^job$|^row$|^#$|^index$/ },
];

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function detectRole(header: string): ColumnRole | null {
  const normalised = normaliseHeader(header);
  if (normalised === '') return null;

  for (const { role, test } of ROLE_PATTERNS) {
    if (test.test(normalised)) return role;
  }
  return 'other';
}

/**
 * Detect roles across a header row, refusing to assign the same role twice.
 * A duplicate falls back to `other`, which keeps the column without letting it
 * silently override the real one.
 */
export function detectRoles(headers: string[]): Record<string, ColumnRole | null> {
  const mapping: Record<string, ColumnRole | null> = {};
  const taken = new Set<ColumnRole>();

  for (const header of headers) {
    const role = detectRole(header);
    if (role !== null && role !== 'other' && !taken.has(role)) {
      taken.add(role);
      mapping[header] = role;
    } else {
      mapping[header] = role === null ? null : 'other';
    }
  }

  return mapping;
}

/** Find the header currently mapped to a role, or null. */
export function headerForRole(
  mapping: Record<string, ColumnRole | null>,
  role: ColumnRole,
): string | null {
  for (const [header, mapped] of Object.entries(mapping)) {
    if (mapped === role) return header;
  }
  return null;
}

/**
 * Columns whose value is identical on every row — BRIEF §5 / SCHEMA.md.
 *
 * A cardinality-1 column is worth zero screen space on a phone. Detected
 * generically, never hard-coded: next week's pack may have a different one.
 */
export function detectConstantColumns(
  rows: Array<Record<string, string>>,
  headers: string[],
): Record<string, string> {
  const constants: Record<string, string> = {};
  if (rows.length < 2) return constants;

  for (const header of headers) {
    const first = rows[0]?.[header] ?? '';
    if (first === '') continue;
    if (rows.every((row) => (row[header] ?? '') === first)) {
      constants[header] = first;
    }
  }

  return constants;
}
