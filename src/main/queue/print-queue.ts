import type { BrowserWindow } from 'electron';
import { describeError } from 'shared/describeError';
import { printReceipt } from '../ipc-events/onRawPrint';
import { logger } from '../logger';
import { printQueueStore } from './print-queue-store';
import { createPrintQueueWorker } from './print-queue-worker';
import { EVENT_CHANNELS } from 'shared/ipcChannels';
import type { PrintJobSummary } from 'shared/printQueue';

let target: BrowserWindow | null = null;

function send(channel: string, job?: PrintJobSummary): void {
  if (target && !target.isDestroyed()) {
    target.webContents.send(channel, job);
  }
}

// The one worker of the process: the single-instance lock makes it the only one.
export const printQueueWorker = createPrintQueueWorker({
  print: printReceipt,
  onPrinted: job => send(EVENT_CHANNELS.jobPrinted, job),
  onFailed: job => send(EVENT_CHANNELS.jobFailed, job),
  onChanged: () => send(EVENT_CHANNELS.queueChanged),
});

// Boot is where the queue file is cured and trimmed (compact and prune are the
// caller's decision, never an effect of reading) and where the leftovers of the
// last session are picked up.
export function bootPrintQueue(window: BrowserWindow): void {
  target = window;

  try {
    printQueueStore.compact();
    printQueueStore.pruneOlderThan();
  } catch (err: unknown) {
    logger.error('print-queue: could not tidy the queue file at boot', describeError(err));
  }

  printQueueWorker.start();
}
