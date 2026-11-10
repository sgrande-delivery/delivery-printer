import type { IpcMainInvokeEvent } from 'electron';
import type { EnqueueRequest, EnqueueResult } from 'shared/printQueue';
import { printQueueWorker } from '../queue/print-queue';

export function onEnqueue(event: IpcMainInvokeEvent, request: EnqueueRequest): EnqueueResult {
  return printQueueWorker.enqueue(request);
}
