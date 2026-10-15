import type { PrintJobSummary } from 'shared/printQueue';
import { printQueueStore } from '../queue/print-queue-store';
import { toSummary } from '../queue/print-queue-worker';

export function onQueueState(): PrintJobSummary[] {
  return printQueueStore.list().map(toSummary);
}
