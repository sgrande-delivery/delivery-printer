import { app, ipcMain } from 'electron';
import { io } from 'socket.io-client';
import constants from '../constants/constants';
import { onRawPrint } from './ipc-events/onRawPrint';
import { onSocketRegister } from './ipc-events/onSocketRegister';
import { onNotification } from './ipc-events/onNotification';
import { onBeforeQuit } from './app-events/onBeforeQuit';
import { onSecondInstance } from './app-events/onSecondInstance';
import { onWindowAllClosed } from './app-events/onWindowAllClosed';
import { TrayBuilder } from './tray';
import { MainWindowBuilder } from './window';
import { registerAutostart } from './autostart';

const socket = io(constants.WS_BASE_URL);

ipcMain.handle('rawPrint', onRawPrint);
ipcMain.handle('socket-register', (event, id: string) => onSocketRegister(event, socket, id));
ipcMain.handle('notification', onNotification);

app.on('before-quit', () => onBeforeQuit(socket));
app.on('window-all-closed', () => onWindowAllClosed(app));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('SGrande Delivery Printer');
}

app
  .whenReady()
  .then(() => {
    registerAutostart();

    const window = new MainWindowBuilder(app).build();

    new TrayBuilder(app, window).build();

    app.on('second-instance', () => onSecondInstance(window));
  })
  .catch(console.log);
