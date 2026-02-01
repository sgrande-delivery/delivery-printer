import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example';

type RawPrint = {
  content: string;
  copies: number;
  deviceName: string | null;
  id: string;
};

type PDFPrint = {
  content: string;
  id: string;
};

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, args: unknown[]) {
      ipcRenderer.send(channel, args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  print: (deviceName?: string): Promise<boolean> => ipcRenderer.invoke('print', deviceName),
  rawPrint: (payload: RawPrint): Promise<void> => ipcRenderer.invoke('rawPrint', payload),
  pdfPrint: (payload: PDFPrint): Promise<void> => ipcRenderer.invoke('pdfPrint', payload),
  socketRegister: (restaurantUuid: string): Promise<void> => ipcRenderer.invoke('socket-register', restaurantUuid),
  notification: (orderSequence: string): Promise<void> => ipcRenderer.invoke('receive-order', orderSequence),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
