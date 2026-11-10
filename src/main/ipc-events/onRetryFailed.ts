import type { IpcMainInvokeEvent } from 'electron';
import { printQueueWorker } from '../queue/print-queue';

export function onRetryFailed(event: IpcMainInvokeEvent, id?: string): number {
  return printQueueWorker.retryFailed(id);
}
