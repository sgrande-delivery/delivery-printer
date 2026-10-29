import './logger';
import { app, ipcMain } from 'electron';
import { onRawPrint } from './ipc-events/onRawPrint';
import { onListPrinters } from './ipc-events/onListPrinters';
import { onEnqueue } from './ipc-events/onEnqueue';
import { onPrintTest } from './ipc-events/onPrintTest';
import { onQueueState } from './ipc-events/onQueueState';
import { onRetryFailed } from './ipc-events/onRetryFailed';
import { onDiscardJob } from './ipc-events/onDiscardJob';
import { onReprintJob } from './ipc-events/onReprintJob';
import { onNotifyConnection } from './ipc-events/onNotifyConnection';
import { bootPrintQueue } from './queue/print-queue';
import { onNotification } from './ipc-events/onNotification';
import { onLog } from './ipc-events/onLog';
import { onRevealLogs } from './ipc-events/onRevealLogs';
import { onUiTheme } from './ipc-events/onUiTheme';
import { onSetUiTheme } from './ipc-events/onSetUiTheme';
import { onResolvedChange, titleBarOverlayFor } from './theme';
import { describeError } from 'shared/describeError';
import { EVENT_CHANNELS, INVOKE_CHANNELS, SEND_CHANNELS } from 'shared/ipcChannels';
import { logger } from './logger';
import { onBeforeQuit } from './app-events/onBeforeQuit';
import { onSecondInstance } from './app-events/onSecondInstance';
import { onWindowAllClosed } from './app-events/onWindowAllClosed';
import { TrayBuilder } from './tray';
import { MainWindowBuilder } from './window';
import { registerAutostart } from './autostart';

ipcMain.handle(INVOKE_CHANNELS.rawPrint, onRawPrint);
ipcMain.handle(INVOKE_CHANNELS.listPrinters, onListPrinters);
ipcMain.handle(INVOKE_CHANNELS.enqueue, onEnqueue);
ipcMain.handle(INVOKE_CHANNELS.printTest, onPrintTest);
ipcMain.handle(INVOKE_CHANNELS.queueState, onQueueState);
ipcMain.handle(INVOKE_CHANNELS.retryFailed, onRetryFailed);
ipcMain.handle(INVOKE_CHANNELS.discardJob, onDiscardJob);
ipcMain.handle(INVOKE_CHANNELS.reprintJob, onReprintJob);
ipcMain.on(SEND_CHANNELS.notifyConnection, onNotifyConnection);
ipcMain.handle(INVOKE_CHANNELS.notification, onNotification);
ipcMain.on(SEND_CHANNELS.log, onLog);
ipcMain.handle(INVOKE_CHANNELS.revealLogs, onRevealLogs);
ipcMain.handle(INVOKE_CHANNELS.uiTheme, onUiTheme);
ipcMain.handle(INVOKE_CHANNELS.setUiTheme, onSetUiTheme);

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
        window.webContents.send(EVENT_CHANNELS.uiThemeChanged, resolved);
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
