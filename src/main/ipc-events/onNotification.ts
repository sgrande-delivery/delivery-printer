import { IpcMainInvokeEvent, Notification } from 'electron';

type Payload = {
  title: string;
  body: string;
};

export function onNotification(event: IpcMainInvokeEvent, { title, body }: Payload): void {
  new Notification({
    title,
    body,
    icon: './assets/icon.ico',
  }).show();
}
