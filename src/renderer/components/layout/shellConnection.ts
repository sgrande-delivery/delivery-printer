import { createContext, useContext } from 'react';

/**
 * Whether the /admin socket is connected, owned by the AppShell. Screens read it from here instead of
 * calling useAdminSocket themselves: the shell is the only owner of the socket hooks, because the
 * stores are module singletons and the unmount of a second owner would disconnect the first.
 */
export const ShellConnectionContext = createContext(false);

export function useShellConnection(): boolean {
  return useContext(ShellConnectionContext);
}
