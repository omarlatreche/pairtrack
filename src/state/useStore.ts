/**
 * Preact binding for the store.
 *
 * Hand-rolled against `preact/hooks` rather than pulling in `preact/compat` for
 * `useSyncExternalStore`: compat is ~3KB for one function, and the subscription
 * is six lines. The `getState()` re-read inside the effect closes the window
 * where a notification lands between render and subscribe.
 */
import { useEffect, useState } from 'preact/hooks';
import { getState, subscribe, type AppState } from './store';

export function useStore(): AppState {
  const [snapshot, setSnapshot] = useState<AppState>(getState);

  useEffect(() => {
    // Catch any change that happened between the initial render and here.
    setSnapshot(getState());
    return subscribe(() => setSnapshot(getState()));
  }, []);

  return snapshot;
}
