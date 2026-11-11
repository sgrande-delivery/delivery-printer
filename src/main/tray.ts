import { Tray, App, BrowserWindow, Menu } from 'electron';
import { getAssetPath } from './asset';

export let isQuiting = false;

export class TrayBuilder {
  private tray: Tray;

  constructor(
    private readonly app: App,
    private readonly window: BrowserWindow
  ) {
    // A dedicated tray bitmap: 16px drawn for that size, with the @2x beside it that Electron picks
    // on its own for high density screens. The installer icon.png is 1024px and would arrive here
    // downscaled. On macOS the Template suffix is what makes the system repaint the icon for the
    // menu bar theme.
    const icon = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';

    this.tray = new Tray(getAssetPath(this.app, 'tray', icon));
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
