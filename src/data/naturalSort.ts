/**
 * Natural / human sort — BRIEF §7.4.
 *
 * Plain string comparison gets alphanumeric references wrong in exactly the way
 * that matters here: it puts `V10` before `V2`, and `ABC456/7` before
 * `ABC123/4` only by luck of digit count. Every reference in this pack is
 * letters-then-digits, so the comparator has to treat digit runs as numbers.
 *
 * Implemented rather than delegated to Intl.Collator({ numeric: true }) because
 * the collator's numeric handling varies subtly between engines, and this needs
 * to be identical on his phone and in CI. It is also about ten lines.
 *
 * All example references in this file are fabricated.
 * no-data-scan: synthetic
 */

/** Split into runs of digits and runs of non-digits. */
function chunk(value: string): string[] {
  return value.match(/\d+|\D+/g) ?? [];
}

export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0;

  const left = chunk(a);
  const right = chunk(b);
  const shared = Math.min(left.length, right.length);

  for (let i = 0; i < shared; i += 1) {
    const l = left[i] as string;
    const r = right[i] as string;

    const lNumeric = /^\d/.test(l);
    const rNumeric = /^\d/.test(r);

    if (lNumeric && rNumeric) {
      // Compare as numbers so 2 < 10. Leading zeros are insignificant here;
      // when the values are equal, the SHORTER run sorts first ("7" before
      // "07"), which is arbitrary but consistent — and consistency is what
      // makes this a total order rather than something Array.sort can trip on.
      const ln = Number(l);
      const rn = Number(r);
      if (ln !== rn) return ln < rn ? -1 : 1;
      if (l.length !== r.length) return l.length - r.length;
      continue;
    }

    if (lNumeric !== rNumeric) {
      // A digit run sorts before a letter run at the same position, matching
      // how these references read.
      return lNumeric ? -1 : 1;
    }

    const cmp = l.localeCompare(r, 'en-GB', { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    // Same letters ignoring case — fall back to a stable byte comparison.
    if (l !== r) return l < r ? -1 : 1;
  }

  return left.length - right.length;
}

/**
 * Normalise a value for search matching — BRIEF §7.5.
 *
 * Case- and separator-insensitive, so `abc123`, `ABC 123` and `ABC-123` all
 * match the same job. Applied to both the haystack and the needle.
 */
export function normaliseForSearch(value: string): string {
  return value.toLowerCase().replace(/[\s\-_/.]/g, '');
}
