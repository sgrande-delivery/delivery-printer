import './logger';
import { app, ipcMain } from 'electron';
import { onRawPrint } from './ipc-events/onRawPrint';
import { onListPrinters } from './ipc-events/onListPrinters';
import { onEnqueue } from './ipc-events/onEnqueue';
import { onPrintTest } from './ipc-events/onPrintTest';
import { onQueueState } from './ipc-events/onQueueState';
import { onRetryFailed } from './ipc-events/onRetryFailed';
import { onNotifyConnection } from './ipc-events/onNotifyConnection';
import { bootPrintQueue } from './queue/print-queue';
import { onNotification } from './ipc-events/onNotification';
import { onLog } from './ipc-events/onLog';
import { onRevealLogs } from './ipc-events/onRevealLogs';
import { onUiTheme } from './ipc-events/onUiTheme';
import { onSetUiTheme } from './ipc-events/onSetUiTheme';
import { onResolvedChange, titleBarOverlayFor } from './theme';
import { describeError } from 'shared/describeError';
import { logger } from './logger';
import { onBeforeQuit } from './app-events/onBeforeQuit';
import { onSecondInstance } from './app-events/onSecondInstance';
import { onWindowAllClosed } from './app-events/onWindowAllClosed';
import { TrayBuilder } from './tray';
import { MainWindowBuilder } from './window';
import { registerAutostart } from './autostart';

ipcMain.handle('rawPrint', onRawPrint);
ipcMain.handle('listPrinters', onListPrinters);
ipcMain.handle('enqueue', onEnqueue);
ipcMain.handle('printTest', onPrintTest);
ipcMain.handle('queueState', onQueueState);
ipcMain.handle('retryFailed', onRetryFailed);
ipcMain.on('notifyConnection', onNotifyConnection);
ipcMain.handle('notification', onNotification);
ipcMain.on('log', onLog);
ipcMain.handle('revealLogs', onRevealLogs);
ipcMain.handle('ui:theme', onUiTheme);
ipcMain.handle('ui:set-theme', onSetUiTheme);

app.on('window-all-closed', () => onWindowAllClosed(app));

function boot(): void {
  if (process.platform === 'win32') {
    app.setAppUserModelId('SGrande Delivery Printer');
  }

  app
    .whenReady()
    .then(() => {
      registerAutostart();

      const window = new MainWindowBuilder(app).build();

      onResolvedChange(resolved => {
        if (window.isDestroyed()) {
          return;
        }

        window.setTitleBarOverlay(titleBarOverlayFor(resolved));
        window.webContents.send('ui:theme-changed', resolved);
      });

      new TrayBuilder(app, window).build();

      bootPrintQueue(window);

      app.on('before-quit', event => onBeforeQuit(event, window));
      app.on('second-instance', () => onSecondInstance(window));
    })
    .catch((err: unknown) => logger.error('boot failed', describeError(err)));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}
