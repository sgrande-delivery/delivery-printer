/**
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import { app, ipcMain } from 'electron';
import { onRawPrint } from './ipc-events/onRawPrint';
import { onPDFPrint } from './ipc-events/onPDFPrint';
import { TrayBuilder } from './tray';
import { MainWindowBuilder } from './window';
import { onWindowAllClosed } from './app-events/onWindowAllClosed';
import { onIPCExample } from './ipc-events/onIPCExample';
import { io } from 'socket.io-client';
import constants from '../constants/constants';
import { onSocketRegister } from './ipc-events/onSocketRegister';
import { onBeforeQuit } from './app-events/onBeforeQuit';
import { onSecondInstance } from './app-events/onSecondInstance';
import { onNotification } from './ipc-events/onNotification';

const socket = io(constants.WS_BASE_URL);

ipcMain.on('ipc-example', onIPCExample);
ipcMain.handle('pdfPrint', onPDFPrint);
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
  .then(async () => {
    const window = await new MainWindowBuilder(app).build();

    new TrayBuilder(app, window).build();

    app.on('second-instance', () => onSecondInstance(window));
  })
  .catch(console.log);
