import type { IpcMainEvent } from 'electron';
import { printQueueWorker } from '../queue/print-queue';

export function onNotifyConnection(event: IpcMainEvent, isConnected: boolean): void {
  printQueueWorker.notifyConnection(isConnected === true);
}
