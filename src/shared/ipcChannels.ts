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
} as const;
