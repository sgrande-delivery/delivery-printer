// Every IPC channel name, written once. The preload and the main process both import from here, so a
// channel can no longer exist on one side only: that failed silently (a rejected invoke that every
// caller swallows, or a listener that never fires) and no test of this repo compares the two sides.
// Renaming a value here renames both ends; a new channel is one entry here, one line in the preload,
// one `ipcMain` registration, and the stub in src/__tests__/setup.ts.

// renderer -> main, request/response (ipcMain.handle / ipcRenderer.invoke)
export const INVOKE_CHANNELS = {
  rawPrint: 'rawPrint',
  listPrinters: 'listPrinters',
  enqueue: 'enqueue',
  printTest: 'printTest',
  queueState: 'queueState',
  retryFailed: 'retryFailed',
  discardJob: 'queue:discard',
  reprintJob: 'queue:reprint',
  notification: 'notification',
  revealLogs: 'revealLogs',
  uiTheme: 'ui:theme',
  setUiTheme: 'ui:set-theme',
  uiSidebarWidth: 'ui:sidebar-width',
  setUiSidebarWidth: 'ui:set-sidebar-width',
  updateState: 'update:state',
  checkForUpdate: 'update:check',
  downloadUpdate: 'update:download',
  setAutoDownloadUpdates: 'update:set-auto-download',
  restartToUpdate: 'update:restart',
  cancelRestart: 'update:cancel-restart',
} as const;

// renderer -> main, fire-and-forget (ipcMain.on / ipcRenderer.send)
export const SEND_CHANNELS = {
  notifyConnection: 'notifyConnection',
  log: 'log',
  beforeQuitDone: 'app:before-quit-done',
} as const;

// main -> renderer (webContents.send / ipcRenderer.on)
export const EVENT_CHANNELS = {
  jobPrinted: 'queue:job-printed',
  jobFailed: 'queue:job-failed',
  queueChanged: 'queue:changed',
  beforeQuit: 'app:before-quit',
  uiThemeChanged: 'ui:theme-changed',
  // Unlike queueChanged, this one carries the WHOLE state in its payload, and the two must not be
  // "standardized" into one shape. The queue lives in a file, so a payload could be stale and its two
  // readers (badge and screen) read it again. The update state lives in memory in the main process, is
  // small and has one consumer, and 'download-progress' fires dozens of times per download: reading again
  // would cost an IPC round trip per tick.
  updateChanged: 'update:changed',
} as const;
