import type { PrintJobSummary } from 'shared/printQueue';
import { printQueueWorker } from '../queue/print-queue';
import { printQueueStore } from '../queue/print-queue-store';
import { toSummary } from '../queue/print-queue-worker';

// Everything the file keeps, printed included: the dashboard counts today's and the history lists
// them (RN-08). The summary never carries the HTML, only whether it can still be reprinted.
export function onQueueState(): PrintJobSummary[] {
  return printQueueStore.list().map(job => toSummary(job, printQueueWorker.nextAttemptOf(job.id)));
}
