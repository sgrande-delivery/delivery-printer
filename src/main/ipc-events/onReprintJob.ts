import type { IpcMainInvokeEvent } from 'electron';
import { printQueueWorker } from '../queue/print-queue';

// Resolves to false when the job is gone, is still pending, or no longer holds the receipt HTML.
// The renderer sends an id only: the HTML never crosses the IPC.
export function onReprintJob(event: IpcMainInvokeEvent, id: string): boolean {
  return printQueueWorker.reprint(id);
}
