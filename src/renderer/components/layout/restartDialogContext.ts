import { createContext, useContext } from 'react';

export interface RestartDialogContextValue {
  /** Asks the AppShell to open the confirmation. No surface restarts the app by itself (spec 79, RF-05). */
  openRestartDialog(): void;
}

/**
 * The dialog state lives in the AppShell, not in /updates: the sidebar card, a third opener, renders inside
 * the shell and not inside the route. Outside the Provider the default does nothing, so a test of a screen
 * has to provide it.
 */
export const RestartDialogContext = createContext<RestartDialogContextValue>({ openRestartDialog: () => undefined });

export function useRestartDialog(): RestartDialogContextValue {
  return useContext(RestartDialogContext);
}
