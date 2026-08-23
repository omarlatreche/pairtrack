/**
 * The application store — BRIEF §6, D2.
 *
 * A plain object, a Set of subscribers and a hook. No state library: the whole
 * state is one pack of jobs plus a view spec, and Redux/Zustand/Jotai would all
 * be more code to audit than the thing they manage.
 *
 * Every mutation that touches job data goes through `commit`, which is the one
 * place that queues the encrypted write. That is what makes "nothing is ever
 * lost" (BRIEF §3.6) a property of the design rather than a discipline.
 */
import { flushSave, queueSave } from '../data/repository';
import type { Job, Pack, Settings, Vault, ViewSpec } from '../data/types';

export type Screen =
  | { name: 'loading' }
  | { name: 'first-run' }
  | { name: 'lock' }
  | { name: 'list' }
  | { name: 'import' }
  | { name: 'settings' };

export interface UndoEntry {
  readonly label: string;
  /**
   * The jobs exactly as they were, so undo is a restore rather than an inverse.
   *
   * A list rather than one job because signing off is a BATCH: it changes every
   * pending job at once, and an action that touches 200 rows in a single tap
   * needs to be reversible in a single tap too. Un-ticking them by hand would
   * not restore them anyway — it would discard the original done timestamps.
   */
  readonly previous: readonly Job[];
  readonly at: number;
}

export interface SessionStats {
  /** Jobs advanced since unlock — the "23 done today" counter. */
  readonly changes: number;
  readonly startedAt: number;
}

export interface AppState {
  screen: Screen;
  vault: Vault | null;
  /** Set while a long operation is genuinely running (only the xlsx parse). */
  busy: string | null;
  error: string | null;
  undo: UndoEntry | null;
  session: SessionStats;
  /** Job to scroll to the top after a mark — auto-advance (BRIEF §7.3). */
  scrollToJobId: string | null;
  /** A service-worker update is waiting. */
  updateReady: boolean;
}

const initialState: AppState = {
  screen: { name: 'loading' },
  vault: null,
  busy: null,
  error: null,
  undo: null,
  session: { changes: 0, startedAt: Date.now() },
  scrollToJobId: null,
  updateReady: false,
};

let state: AppState = initialState;
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Update UI-only state. Does not touch storage. */
export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  notify();
}

/**
 * Update the vault and queue an encrypted write.
 *
 * The only path by which job data changes. Nothing else may assign
 * `state.vault`.
 */
export function commit(update: (vault: Vault) => Vault): void {
  if (state.vault === null) return;
  const next = update(state.vault);
  state = { ...state, vault: next };
  queueSave(next);
  notify();
}

/** Force the pending write out — before lock, export, or page hide. */
export async function flush(): Promise<void> {
  await flushSave();
}

// --- Convenience selectors --------------------------------------------------

export function activePack(): Pack | null {
  const vault = state.vault;
  if (vault === null) return null;
  return vault.packs.find((pack) => pack.id === vault.activePackId) ?? vault.packs[0] ?? null;
}

export function settings(): Settings | null {
  return state.vault?.settings ?? null;
}

export function findJob(jobId: string): Job | null {
  return activePack()?.jobs.find((job) => job.id === jobId) ?? null;
}

// --- Mutations --------------------------------------------------------------

export function updateJob(jobId: string, update: (job: Job) => Job): void {
  commit((vault) => {
    // `pack.id !== (vault.activePackId ?? pack.id)` is false for EVERY pack
    // when activePackId is null, so the update would apply to all of them —
    // and job ids are derived from the job number, so the same job in last
    // week's pack would be marked too. Refuse instead.
    if (vault.activePackId === null) return vault;

    return {
      ...vault,
      packs: vault.packs.map((pack) =>
        pack.id !== vault.activePackId
          ? pack
          : { ...pack, jobs: pack.jobs.map((job) => (job.id === jobId ? update(job) : job)) },
      ),
    };
  });
}

export function updateSettings(update: (current: Settings) => Settings): void {
  commit((vault) => ({ ...vault, settings: update(vault.settings) }));
}

export function updateView(patch: Partial<ViewSpec>): void {
  updateSettings((current) => ({ ...current, view: { ...current.view, ...patch } }));
}

export function countChange(): void {
  setState({ session: { ...state.session, changes: state.session.changes + 1 } });
  commit((vault) => ({
    ...vault,
    settings: { ...vault.settings, changesSinceBackup: vault.settings.changesSinceBackup + 1 },
  }));
}

// --- Undo (BRIEF §7.3: a 6-second toast) ------------------------------------

const UNDO_WINDOW_MS = 6000;
let undoTimer: ReturnType<typeof setTimeout> | null = null;

export function offerUndo(entry: Omit<UndoEntry, 'at'>): void {
  if (undoTimer !== null) clearTimeout(undoTimer);
  setState({ undo: { ...entry, at: Date.now() } });
  undoTimer = setTimeout(() => {
    if (state.undo !== null && Date.now() - state.undo.at >= UNDO_WINDOW_MS - 50) {
      setState({ undo: null });
    }
  }, UNDO_WINDOW_MS);
}

export function performUndo(): void {
  const entry = state.undo;
  if (entry === null) return;

  // Restore whole jobs, not an inverse operation: an inverse can drift from the
  // forward operation, a restore cannot.
  for (const job of entry.previous) updateJob(job.id, () => job);
  setState({
    undo: null,
    session: {
      ...state.session,
      changes: Math.max(0, state.session.changes - entry.previous.length),
    },
  });
  if (undoTimer !== null) clearTimeout(undoTimer);
}

export function dismissUndo(): void {
  setState({ undo: null });
  if (undoTimer !== null) clearTimeout(undoTimer);
}

/** Clear everything decrypted from memory. Called on lock (BRIEF §9.4). */
export function clearDecryptedState(): void {
  if (undoTimer !== null) clearTimeout(undoTimer);
  undoTimer = null;
  state = {
    ...initialState,
    screen: { name: 'lock' },
    updateReady: state.updateReady,
    session: { changes: 0, startedAt: Date.now() },
  };
  notify();
}

/** Test seam. */
export function __resetStoreForTests(): void {
  if (undoTimer !== null) clearTimeout(undoTimer);
  undoTimer = null;
  state = { ...initialState, session: { changes: 0, startedAt: Date.now() } };
  listeners.clear();
}
