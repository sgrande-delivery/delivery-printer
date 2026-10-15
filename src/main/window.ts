import { App, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { getAssetPath } from './asset';
import { loadRenderer } from './util';
import { isQuiting } from './tray';
import { registerDevtools } from './devtools';
import { AppUpdater } from './updater';

export class MainWindowBuilder {
  private window: BrowserWindow;

  constructor(app: App) {
    this.window = new BrowserWindow({
      show: false,
      width: 1024,
      height: 728,
      icon: getAssetPath(app, 'icon.ico'),
      webPreferences: {
        // electron-vite emits the preload bundle next to the main bundle, so
        // this path is the same in development and packaged.
        preload: path.join(__dirname, '../preload/preload.js'),
      },
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: 'white',
        symbolColor: '#222',
        height: 50,
      },
    });
  }

  build(): BrowserWindow {
    loadRenderer(this.window);

    this.settings();
    this.events();
    this.updater();

    registerDevtools(this.window);

    return this.window;
  }

  private settings() {
    // The app never uses the menu bar; dropping it outright is clearer than
    // building a menu and then hiding it.
    Menu.setApplicationMenu(null);
    this.window.setMenuBarVisibility(false);

    this.window.webContents.setWindowOpenHandler(edata => {
      shell.openExternal(edata.url);

      return {
        action: 'deny',
      };
    });
  }

  private events() {
    this.window.on('ready-to-show', () => {
      if (process.env.START_MINIMIZED) {
        this.window.minimize();
        return;
      }

      this.window.show();
    });

    this.window.on('close', event => {
      if (isQuiting) {
        return;
      }

      event.preventDefault();

      this.window.hide();
    });
  }

  private updater() {
    const updater = new AppUpdater();
    updater.run();
  }
}
