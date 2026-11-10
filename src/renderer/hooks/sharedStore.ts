import { useSyncExternalStore } from 'react';

export interface SharedStoreApi<T> {
  get(): T;
  set(next: T): void;
}

export interface SharedStore<T> extends SharedStoreApi<T> {
  subscribe(listener: () => void): () => void;
}

/**
 * State that lives outside React and is loaded once for however many components read it.
 *
 * `start` runs when the first reader mounts and returns the teardown, which runs when the last one
 * unmounts, putting the state back to `initial`. Two components calling the same hook share one request
 * and one IPC subscription instead of each opening their own, and cannot disagree for a moment.
 * A `set` with no reader mounted is dropped: a late answer must not leak into the next session.
 */
export function createSharedStore<T>(initial: T, start: (store: SharedStoreApi<T>) => () => void): SharedStore<T> {
  const listeners = new Set<() => void>();
  let state = initial;
  let stop: (() => void) | null = null;

  const api: SharedStoreApi<T> = {
    get: () => state,
    set: next => {
      if (listeners.size === 0 || Object.is(next, state)) {
        return;
      }

      state = next;
      listeners.forEach(listener => listener());
    },
  };

  return {
    ...api,
    subscribe: listener => {
      listeners.add(listener);

      if (listeners.size === 1) {
        stop = start(api);
      }

      return () => {
        listeners.delete(listener);

        if (listeners.size === 0) {
          stop?.();
          stop = null;
          state = initial;
        }
      };
    },
  };
}

export function useSharedStore<T>(store: SharedStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
