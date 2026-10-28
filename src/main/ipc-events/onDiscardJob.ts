import type { IpcMainInvokeEvent } from 'electron';
import { printQueueWorker } from '../queue/print-queue';

// Resolves to false when the job is gone or is not failed; the refusal is the worker's, not the screen's.
export function onDiscardJob(event: IpcMainInvokeEvent, id: string): boolean {
  return printQueueWorker.discardFailed(id);
}
