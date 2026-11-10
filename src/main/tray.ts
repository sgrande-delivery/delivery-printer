import { Tray, App, BrowserWindow, Menu } from 'electron';
import { getAssetPath } from './asset';

export let isQuiting = false;

export class TrayBuilder {
  private tray: Tray;

  constructor(
    private readonly app: App,
    private readonly window: BrowserWindow
  ) {
    this.tray = new Tray(getAssetPath(this.app, 'icon.png'));
  }

  build() {
    this.menu();
    this.events();
    this.tooltip();
  }

  private tooltip() {
    this.tray.setToolTip('SGrande Delivery Printer');
  }

  private menu() {
    const menu = Menu.buildFromTemplate([
      {
        label: '    Abrir',
        click: () => {
          this.window.show();
        },
      },
      {
        label: '    Minimizar para a bandeja',
        click: () => {
          this.window.hide();
        },
      },
      {
        type: 'separator',
      },
      {
        label: '    Fechar',
        click: () => {
          isQuiting = true;
          this.app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  private events() {
    this.tray.on('double-click', () => {
      this.window.show();
    });
  }
}
