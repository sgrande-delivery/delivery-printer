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

  socketRegister: (restaurantUuid: string): Promise<void> => ipcRenderer.invoke('socket-register', restaurantUuid),

  notification: (orderSequence: string): Promise<void> => ipcRenderer.invoke('notification', orderSequence),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
