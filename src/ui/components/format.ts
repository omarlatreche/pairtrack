/**
 * Formatting helpers.
 *
 * `Intl.DateTimeFormat` with `en-GB`, no date library (BRIEF §6). The reference
 * tool shows `20/08/2026, 10:33`, so timestamps here match what he already
 * reads.
 */

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeOnly = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatStamp(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTime.format(date);
}

/** Today's stamps show the time only — the date is noise on a job worked now. */
export function formatStampSmart(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  return sameDay ? timeOnly.format(date) : dateTime.format(date);
}

/** "1h 42m" — the session counter in the header. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
