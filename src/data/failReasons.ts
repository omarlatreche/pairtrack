/**
 * Canned fail reasons — BRIEF §7.6.
 *
 * These match *migration* work, not fault repair: this pack moves circuits
 * between equipment shelves via the MDF, so a job fails because the pair is not
 * where the paperwork says, the port is unusable, or the line tests bad after
 * the move.
 *
 * BRIEF §7.6 is explicit that this list was written by someone who has not done
 * the job. It is a starting point. The labels are editable in Settings, and the
 * stored value is the `code`, never the label (D11) — so changing wording is a
 * text edit, not a data migration.
 */
import type { FailReason } from './types';

export const DEFAULT_FAIL_REASONS: FailReason[] = [
  { code: 'bar-pair-not-as-documented', label: 'Bar pair not as documented', enabled: true },
  { code: 'pair-already-in-use', label: 'Pair already in use', enabled: true },
  { code: 'no-jumper-on-old-equipment', label: 'No jumper found on old equipment', enabled: true },
  { code: 'new-port-faulty', label: 'New equipment port faulty', enabled: true },
  { code: 'ties-not-as-documented', label: 'Ties not present / not as documented', enabled: true },
  { code: 'wiring-damaged', label: 'Wiring damaged', enabled: true },
  { code: 'tests-faulty-after-move', label: 'Tests faulty after move', enabled: true },
  { code: 'no-dial-tone-after-move', label: 'No dial tone after move', enabled: true },
  { code: 'customer-service-in-use', label: 'Customer service in use — cannot interrupt', enabled: true },
  { code: 'access-blocked', label: 'Access to frame blocked', enabled: true },
  { code: 'awaiting-info', label: 'Awaiting further info', enabled: true },
];

/** 'other' is always available and always last; free text goes in notes. */
export const OTHER_REASON_CODE = 'other';

export function failReasonLabel(reasons: FailReason[], code: string | null): string {
  if (code === null) return '';
  if (code === OTHER_REASON_CODE) return 'Other';
  return reasons.find((r) => r.code === code)?.label ?? code;
}

/** Slug for a reason the engineer adds himself. */
export function slugifyReason(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug === '' ? `custom-${Date.now().toString(36)}` : slug;
}
