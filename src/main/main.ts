import { app, ipcMain } from 'electron';
import { onRawPrint } from './ipc-events/onRawPrint';
import { onNotification } from './ipc-events/onNotification';
import { onBeforeQuit } from './app-events/onBeforeQuit';
import { onSecondInstance } from './app-events/onSecondInstance';
import { onWindowAllClosed } from './app-events/onWindowAllClosed';
import { TrayBuilder } from './tray';
import { MainWindowBuilder } from './window';
import { registerAutostart } from './autostart';

ipcMain.handle('rawPrint', onRawPrint);
ipcMain.handle('notification', onNotification);

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

      new TrayBuilder(app, window).build();

      app.on('before-quit', event => onBeforeQuit(event, window));
      app.on('second-instance', () => onSecondInstance(window));
    })
    .catch(console.log);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}
