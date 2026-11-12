import { createContext, useContext } from 'react';
import type { UpdateState } from 'shared/appUpdate';

export interface AppUpdateContextValue {
  /** null until the first answer of the main process. */
  state: UpdateState | null;
  check(): Promise<void>;
  download(): Promise<void>;
  setAutoDownload(value: boolean): Promise<void>;
}

const noop = (): Promise<void> => Promise.resolve();

/**
 * The update state, owned by the AppShell. Whoever shows it reads it from here and never mounts
 * useAppUpdate: a second owner would subscribe a second listener and read the state twice.
 */
export const AppUpdateContext = createContext<AppUpdateContextValue>({
  state: null,
  check: noop,
  download: noop,
  setAutoDownload: noop,
});

export function useAppUpdateContext(): AppUpdateContextValue {
  return useContext(AppUpdateContext);
}
