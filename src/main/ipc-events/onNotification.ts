import { app, IpcMainInvokeEvent, Notification } from 'electron';
import { getAssetPath } from '../asset';

type Payload = {
  title: string;
  body: string;
};

export function onNotification(event: IpcMainInvokeEvent, { title, body }: Payload): void {
  new Notification({
    title,
    body,
    // Resolved against the asset root, not the working directory: packaged, the cwd is wherever the
    // shortcut was launched from, so the old relative './assets/icon.ico' only ever found the file
    // in development and the notification shipped with no icon.
    icon: getAssetPath(app, 'icon.ico'),
  }).show();
}
