/**
 * Re-import merge — BRIEF §5.1 / §7.8.
 *
 * The rule that matters: **matched jobs keep their progress.** Source columns
 * A-I refresh from the new file, progress does not move. That is the entire
 * reason `source` and `progress` are separate objects.
 *
 * A job that has vanished from the new pack is *flagged*, never deleted. If he
 * ticked it last week and the office dropped it from this week's file, the tick
 * is still the record of what he did.
 */
import { hasProgress } from '../data/transitions';
import type { Job, Pack } from '../data/types';

export interface MergePreview {
  readonly total: number;
  readonly added: number;
  readonly matched: number;
  readonly missing: number;
  /** Matched jobs that carry progress worth keeping — the number he cares about. */
  readonly progressKept: number;
}

export function previewMerge(existing: Job[], incoming: Job[]): MergePreview {
  const existingById = new Map(existing.map((job) => [job.id, job]));
  const incomingIds = new Set(incoming.map((job) => job.id));

  let added = 0;
  let matched = 0;
  let progressKept = 0;

  for (const job of incoming) {
    const previous = existingById.get(job.id);
    if (previous === undefined) {
      added += 1;
    } else {
      matched += 1;
      if (hasProgress(previous.progress)) progressKept += 1;
    }
  }

  const missing = existing.filter((job) => !incomingIds.has(job.id)).length;

  return { total: incoming.length, added, matched, missing, progressKept };
}

export function mergeJobs(existing: Job[], incoming: Job[], now: string): Job[] {
  const existingById = new Map(existing.map((job) => [job.id, job]));
  const incomingIds = new Set(incoming.map((job) => job.id));

  const merged: Job[] = incoming.map((fresh) => {
    const previous = existingById.get(fresh.id);
    if (previous === undefined) return fresh;

    // Source refreshes, progress and history survive untouched.
    return {
      ...fresh,
      progress: previous.progress,
      history: previous.history,
      missingSince: null,
    };
  });

  // Anything the new pack no longer lists is kept and flagged.
  for (const job of existing) {
    if (incomingIds.has(job.id)) continue;
    merged.push({ ...job, missingSince: job.missingSince ?? now });
  }

  return merged;
}

/** Human-readable summary for the confirm step, phrased as BRIEF §7.8 asks. */
export function describeMerge(preview: MergePreview): string {
  const parts = [
    `${preview.total} jobs`,
    `${preview.added} new`,
    `${preview.matched} matched`,
    `${preview.missing} removed`,
  ];
  let text = `${parts[0]} — ${parts.slice(1).join(', ')}.`;
  if (preview.progressKept > 0) {
    text += ` Progress on ${preview.progressKept} job${preview.progressKept === 1 ? '' : 's'} will be kept.`;
  }
  if (preview.missing > 0) {
    text += ` ${preview.missing} job${preview.missing === 1 ? '' : 's'} no longer in the pack will be flagged, not deleted.`;
  }
  return text;
}

/** Pack name from a filename: drop the extension, tidy separators. */
export function packNameFromFile(fileName: string): string {
  return (
    fileName
      .replace(/\.(xlsx|xlsm|xlsb|xls|csv)$/i, '')
      .replace(/[_]+/g, ' ')
      .trim() || 'Job pack'
  );
}

export function makePackId(name: string, now: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug || 'pack'}-${Date.parse(now).toString(36)}`;
}

/** Find an existing pack to merge into: same name, most recently imported. */
export function findMergeTarget(packs: Pack[], name: string): Pack | null {
  const candidates = packs.filter((pack) => pack.name.toLowerCase() === name.toLowerCase());
  if (candidates.length === 0) return null;
  return (
    candidates.sort((a, b) => b.lastImportedAt.localeCompare(a.lastImportedAt))[0] ?? null
  );
}
