import { contextBridge, ipcRenderer } from 'electron';
import type { EnqueueRequest, EnqueueResult, PrintJobSummary } from 'shared/printQueue';

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

  enqueue: (request: EnqueueRequest): Promise<EnqueueResult> => ipcRenderer.invoke('enqueue', request),

  // The summary never carries the receipt HTML (see PrintJobSummary).
  queueState: (): Promise<PrintJobSummary[]> => ipcRenderer.invoke('queueState'),

  // Resolves to how many failed jobs went back to pending.
  retryFailed: (id?: string): Promise<number> => ipcRenderer.invoke('retryFailed', id),

  // Fire-and-forget: it only wakes the worker.
  notifyConnection: (isConnected: boolean): void => ipcRenderer.send('notifyConnection', isConnected),

  onJobPrinted: (listener: (job: PrintJobSummary) => void): (() => void) => {
    const handler = (_event: unknown, job: PrintJobSummary): void => listener(job);
    ipcRenderer.on('queue:job-printed', handler);

    return () => {
      ipcRenderer.removeListener('queue:job-printed', handler);
    };
  },

  onJobFailed: (listener: (job: PrintJobSummary) => void): (() => void) => {
    const handler = (_event: unknown, job: PrintJobSummary): void => listener(job);
    ipcRenderer.on('queue:job-failed', handler);

    return () => {
      ipcRenderer.removeListener('queue:job-failed', handler);
    };
  },

  // Every transition that changes what is waiting or what failed, with no payload:
  // whoever shows the queue reads it again through queueState. It exists so that
  // showing the queue does not mean reading the file on a timer.
  onQueueChanged: (listener: () => void): (() => void) => {
    const handler = (): void => listener();
    ipcRenderer.on('queue:changed', handler);

    return () => {
      ipcRenderer.removeListener('queue:changed', handler);
    };
  },

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
