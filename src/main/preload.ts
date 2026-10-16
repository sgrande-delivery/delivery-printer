import { contextBridge, ipcRenderer } from 'electron';

type RawPrint = {
  content: string;
  copies: number;
  deviceName: string | null;
  id: string;
};

const electronHandler = {
  // The app ships for both ia32 and x64, so the UI reads the real architecture
  // instead of assuming one.
  arch: process.arch,

  rawPrint: (payload: RawPrint): Promise<void> => ipcRenderer.invoke('rawPrint', payload),

  // First channel in the main -> renderer direction. The renderer must call the
  // returned function on cleanup and send the ack once it has emitted.
  onBeforeQuit: (listener: () => void): (() => void) => {
    const handler = (): void => listener();
    ipcRenderer.on('app:before-quit', handler);

    return () => {
      ipcRenderer.removeListener('app:before-quit', handler);
    };
  },

  beforeQuitDone: (): void => ipcRenderer.send('app:before-quit-done'),

  // Fire-and-forget on purpose: logging must never reject into the caller.
  log: (level: 'error' | 'warn' | 'info', message: string, context?: Record<string, unknown>): void =>
    ipcRenderer.send('log', level, message, context),

  notification: (payload: { title: string; body: string }): Promise<void> =>
    ipcRenderer.invoke('notification', payload),

  // Resolves to false when there is no record yet (file absent or empty), so the UI can say so.
  revealLogs: (): Promise<boolean> => ipcRenderer.invoke('revealLogs'),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
