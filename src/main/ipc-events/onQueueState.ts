import type { PrintJobSummary } from 'shared/printQueue';
import { printQueueStore } from '../queue/print-queue-store';
import { toSummary } from '../queue/print-queue-worker';

// Only what is waiting and what failed: those are the two states the screen tells
// apart (RN-05). The printed records are the deduplication ledger of the main
// process (RN-01) and have no reader in the renderer.
export function onQueueState(): PrintJobSummary[] {
  return printQueueStore
    .list()
    .filter(job => job.status !== 'printed')
    .map(toSummary);
}
