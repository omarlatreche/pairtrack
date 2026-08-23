/**
 * MDF BAR PAIR parsing — BRIEF §5, SCHEMA.md.
 *
 * Format: `<frame>/<block><number>`, e.g. `01/U9001`, `09/INTL0021`.
 *
 * This is the field that makes frame-walk order possible, which is the single
 * highest-value transformation in the app: it turns "the order the office typed
 * it" into "the order he physically walks the frame".
 *
 * One row in the real pack holds a bare `0` instead of a reference. It must
 * import, be flagged, and be correctable in-app — never dropped, never a crash.
 *
 * All example references in this file are fabricated.
 * no-data-scan: synthetic
 */
import type { BarPair } from './types';

/**
 * frame  = leading digits
 * block  = letters (A-W in this pack, or the literal INTL)
 * number = trailing digits
 *
 * Deliberately permissive about separators and case: next week's pack may be
 * formatted slightly differently, and refusing to parse is worse than parsing
 * generously and letting him correct the odd one.
 */
const BAR_PAIR_RE = /^\s*(\d{1,3})\s*[/\-\s]\s*([A-Z]{1,6})\s*(\d{1,6})\s*$/i;

export function parseBarPair(raw: string | null | undefined): BarPair | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;

  const match = BAR_PAIR_RE.exec(trimmed);
  if (match === null) return null;

  const [, frameDigits, blockLetters, numberDigits] = match;
  if (!frameDigits || !blockLetters || !numberDigits) return null;

  const number = Number.parseInt(numberDigits, 10);
  if (!Number.isFinite(number)) return null;

  return {
    // Keep the frame zero-padded to two digits so '1' and '01' are one frame.
    frame: frameDigits.padStart(2, '0'),
    block: blockLetters.toUpperCase(),
    number,
    raw: trimmed,
  };
}

/** Human-readable frame position for a card chip. */
export function formatBarPair(barPair: BarPair | null): string {
  if (barPair === null) return 'Unplaced';
  return `${barPair.frame}/${barPair.block}${barPair.number}`;
}

/** The group key for "group by block" — sticky section headers per frame/block. */
export function blockKey(barPair: BarPair | null): string {
  if (barPair === null) return 'Unplaced';
  return `${barPair.frame}/${barPair.block}`;
}

/**
 * Compare two bar pairs in frame-walk order: frame, then block, then the pair
 * number *numerically*.
 *
 * Unparseable pairs sort last, into the `Unplaced` group, rather than breaking
 * the sort (BRIEF §11).
 *
 * BRIEF §14 Q1 asks whether verticals genuinely run in alphabetical block
 * order. If they do not, this is the one function to change: swap the block
 * comparison for a lookup in a physical-order table.
 */
export function compareBarPair(a: BarPair | null, b: BarPair | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // Unplaced goes to the end
  if (b === null) return -1;

  if (a.frame !== b.frame) return a.frame.localeCompare(b.frame, 'en-GB');
  if (a.block !== b.block) return a.block.localeCompare(b.block, 'en-GB');
  return a.number - b.number;
}
