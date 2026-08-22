/**
 * Passphrase policy and a small local strength heuristic — BRIEF §9.6.
 *
 * Deliberately no dependency: zxcvbn is ~800KB and would have to be precached
 * for offline use. This is a rough guide for a single user, not a gate.
 */

export const MIN_PASSPHRASE_LENGTH = 12;

export type StrengthLabel = 'too short' | 'weak' | 'fair' | 'good' | 'strong';

export interface Strength {
  /** 0-4, for the meter. */
  readonly score: 0 | 1 | 2 | 3 | 4;
  readonly label: StrengthLabel;
  /** One actionable suggestion, or null when it is already strong. */
  readonly hint: string | null;
}

/** Sequences and layout runs that add length without adding entropy. */
const SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '01234567890',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

const COMMON = [
  'password', 'passphrase', 'letmein', 'welcome', 'monkey', 'dragon', 'qwerty',
  'iloveyou', 'admin', 'login', 'openreach', 'pairtrack', 'bt', 'kelly',
];

function hasSequentialRun(lower: string, minRun = 4): boolean {
  for (const seq of SEQUENCES) {
    for (let i = 0; i + minRun <= seq.length; i += 1) {
      const run = seq.slice(i, i + minRun);
      if (lower.includes(run)) return true;
      if (lower.includes([...run].reverse().join(''))) return true;
    }
  }
  return false;
}

function hasRepeatedChunk(lower: string): boolean {
  // "abcabcabc", "aaaa", "1212"
  return /(.{1,4})\1{2,}/.test(lower);
}

export function assessPassphrase(passphrase: string): Strength {
  const length = passphrase.length;

  if (length < MIN_PASSPHRASE_LENGTH) {
    return {
      score: 0,
      label: 'too short',
      hint: `At least ${MIN_PASSPHRASE_LENGTH} characters. Three or four unrelated words work well.`,
    };
  }

  const lower = passphrase.toLowerCase();
  const classes =
    Number(/[a-z]/.test(passphrase)) +
    Number(/[A-Z]/.test(passphrase)) +
    Number(/\d/.test(passphrase)) +
    Number(/[^A-Za-z0-9]/.test(passphrase));

  const distinct = new Set(passphrase).size;
  const words = passphrase.trim().split(/\s+/).filter(Boolean).length;

  let points = 0;

  // Length is what actually matters.
  if (length >= 12) points += 1;
  if (length >= 16) points += 1;
  if (length >= 20) points += 1;
  if (length >= 28) points += 1;

  // A multi-word phrase is easier to remember and harder to guess than
  // one word with substitutions, so it earns as much as a character class.
  if (words >= 3) points += 1;
  if (classes >= 3) points += 1;
  if (distinct >= 10) points += 1;

  if (COMMON.some((c) => lower.includes(c))) points -= 2;
  if (hasSequentialRun(lower)) points -= 1;
  if (hasRepeatedChunk(lower)) points -= 1;
  if (distinct <= 4) points -= 1;

  const score = Math.max(1, Math.min(4, points)) as 1 | 2 | 3 | 4;

  const labels: Record<1 | 2 | 3 | 4, StrengthLabel> = {
    1: 'weak',
    2: 'fair',
    3: 'good',
    4: 'strong',
  };

  let hint: string | null = null;
  if (COMMON.some((c) => lower.includes(c))) {
    hint = 'Contains a very common word — an attacker tries those first.';
  } else if (hasSequentialRun(lower)) {
    hint = 'Contains a keyboard or alphabet run. Break it up.';
  } else if (hasRepeatedChunk(lower)) {
    hint = 'Contains a repeated chunk, which adds length but not strength.';
  } else if (length < 16) {
    hint = 'Longer is better than more complicated. Try adding another word.';
  } else if (score < 4) {
    hint = 'Add a word, a number or a symbol.';
  }

  return { score, label: labels[score], hint };
}

/** Cheap check the UI uses before enabling the button. */
export function isPassphraseAcceptable(passphrase: string): boolean {
  return passphrase.length >= MIN_PASSPHRASE_LENGTH;
}
