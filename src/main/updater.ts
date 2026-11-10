import { autoUpdater } from 'electron-updater';
import { describeError } from 'shared/describeError';
import { logger } from './logger';
import { Notification } from 'electron';
import path from 'path';

export class AppUpdater {
  constructor() {
    autoUpdater.logger = logger;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    this.events();
  }

  run() {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      logger.error('update check failed', describeError(err));
    });
  }

  private notification() {
    new Notification({
      icon: path.join(process.resourcesPath, 'assets', 'icon.ico'),
      title: `Nova versão disponível`,
      body: 'Feche a aplicação e espere alguns segundos para aplicar a atualização',
    }).show();
  }

  private events() {
    autoUpdater.on('update-downloaded', () => {
      this.notification();
    });
  }
}
