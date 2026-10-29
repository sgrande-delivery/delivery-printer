import { contextBridge, ipcRenderer } from 'electron';
import type { EnqueueRequest, EnqueueResult, PrintJobSummary, TestPrintRequest } from 'shared/printQueue';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS } from 'shared/ipcChannels';
import { themeFromArgv } from 'shared/uiTheme';
import type { ResolvedTheme, ThemePreference, UiThemeState } from 'shared/uiTheme';

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

  rawPrint: (payload: RawPrint): Promise<void> => ipcRenderer.invoke(INVOKE_CHANNELS.rawPrint, payload),

  // Resolves to [] when the machine has none or the spooler fails; it never rejects.
  listPrinters: (): Promise<WindowsPrinter[]> => ipcRenderer.invoke(INVOKE_CHANNELS.listPrinters),

  enqueue: (request: EnqueueRequest): Promise<EnqueueResult> => ipcRenderer.invoke(INVOKE_CHANNELS.enqueue, request),

  // Queues a diagnostic page for one registered printer; same retry and failure path as a receipt.
  printTest: (request: TestPrintRequest): Promise<EnqueueResult> =>
    ipcRenderer.invoke(INVOKE_CHANNELS.printTest, request),

  // The summary never carries the receipt HTML (see PrintJobSummary).
  queueState: (): Promise<PrintJobSummary[]> => ipcRenderer.invoke(INVOKE_CHANNELS.queueState),

  // Resolves to how many failed jobs went back to pending.
  retryFailed: (id?: string): Promise<number> => ipcRenderer.invoke(INVOKE_CHANNELS.retryFailed, id),

  // Removes a failed job for good. Resolves to false when the job is gone or is not failed (a pending
  // one is still going out, and the main process refuses it).
  discardJob: (id: string): Promise<boolean> => ipcRenderer.invoke(INVOKE_CHANNELS.discardJob, id),

  // Sends a printed or failed job through the printer again, same id; the HTML stays in the main
  // process. Resolves to false when the job is gone, is pending, or its HTML was already dropped.
  reprintJob: (id: string): Promise<boolean> => ipcRenderer.invoke(INVOKE_CHANNELS.reprintJob, id),

  // Fire-and-forget: it only wakes the worker.
  notifyConnection: (isConnected: boolean): void => ipcRenderer.send(SEND_CHANNELS.notifyConnection, isConnected),

  onJobPrinted: (listener: (job: PrintJobSummary) => void): (() => void) => {
    const handler = (_event: unknown, job: PrintJobSummary): void => listener(job);
    ipcRenderer.on(EVENT_CHANNELS.jobPrinted, handler);

    return () => {
      ipcRenderer.removeListener(EVENT_CHANNELS.jobPrinted, handler);
    };
  },

  onJobFailed: (listener: (job: PrintJobSummary) => void): (() => void) => {
    const handler = (_event: unknown, job: PrintJobSummary): void => listener(job);
    ipcRenderer.on(EVENT_CHANNELS.jobFailed, handler);

    return () => {
      ipcRenderer.removeListener(EVENT_CHANNELS.jobFailed, handler);
    };
  },

  // Every transition that changes what is waiting or what failed, with no payload:
  // whoever shows the queue reads it again through queueState. It exists so that
  // showing the queue does not mean reading the file on a timer.
  onQueueChanged: (listener: () => void): (() => void) => {
    const handler = (): void => listener();
    ipcRenderer.on(EVENT_CHANNELS.queueChanged, handler);

    return () => {
      ipcRenderer.removeListener(EVENT_CHANNELS.queueChanged, handler);
    };
  },

  // First channel in the main -> renderer direction. The renderer must call the
  // returned function on cleanup and send the ack once it has emitted.
  onBeforeQuit: (listener: () => void): (() => void) => {
    const handler = (): void => listener();
    ipcRenderer.on(EVENT_CHANNELS.beforeQuit, handler);

    return () => {
      ipcRenderer.removeListener(EVENT_CHANNELS.beforeQuit, handler);
    };
  },

  beforeQuitDone: (): void => ipcRenderer.send(SEND_CHANNELS.beforeQuitDone),

  // Fire-and-forget on purpose: logging must never reject into the caller.
  log: (level: 'error' | 'warn' | 'info', message: string, context?: Record<string, unknown>): void =>
    ipcRenderer.send(SEND_CHANNELS.log, level, message, context),

  notification: (payload: { title: string; body: string }): Promise<void> =>
    ipcRenderer.invoke(INVOKE_CHANNELS.notification, payload),

  // Resolves to false when there is no record yet (file absent or empty), so the UI can say so.
  revealLogs: (): Promise<boolean> => ipcRenderer.invoke(INVOKE_CHANNELS.revealLogs),

  // The theme resolved when the window was created (webPreferences.additionalArguments), readable
  // synchronously: it is what lets the first paint already be in the right theme. null if absent.
  initialTheme: themeFromArgv(process.argv ?? []),

  uiTheme: (): Promise<UiThemeState> => ipcRenderer.invoke(INVOKE_CHANNELS.uiTheme),

  // Saves for this installation and resolves to the theme that now applies.
  setUiTheme: (preference: ThemePreference): Promise<ResolvedTheme> =>
    ipcRenderer.invoke(INVOKE_CHANNELS.setUiTheme, preference),

  // Only when the resolved light/dark changes, not on every system appearance event.
  onUiThemeChanged: (listener: (resolved: ResolvedTheme) => void): (() => void) => {
    const handler = (_event: unknown, resolved: ResolvedTheme): void => listener(resolved);
    ipcRenderer.on(EVENT_CHANNELS.uiThemeChanged, handler);

    return () => {
      ipcRenderer.removeListener(EVENT_CHANNELS.uiThemeChanged, handler);
    };
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
