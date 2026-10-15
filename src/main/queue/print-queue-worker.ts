import { describeError } from 'shared/describeError';
import type { EnqueueRequest, EnqueueResult, PrintJob, PrintJobSummary, PrintPayload } from 'shared/printQueue';
import { logger } from '../logger';
import { isPrintJob, printQueueStore } from './print-queue-store';

// The real case is a printer switched off for a few minutes. Retrying for hours
// only hides the problem from whoever has to act, so the limit is low and the
// failure becomes visible (RN-05): 2 s, 4 s, 8 s, 16 s between five attempts.
export const MAX_ATTEMPTS = 5;
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_MAX_MS = 30000;

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
}

// An explicit pick, never a spread of the job: the receipt HTML must not cross
// to the renderer (and the test on the channel payload holds this).
export function toSummary(job: PrintJob): PrintJobSummary {
  return {
    id: job.id,
    kind: job.kind,
    orderUuid: job.orderUuid,
    label: job.label,
    attempts: job.attempts,
    status: job.status,
    createdAt: job.createdAt,
    lastError: job.lastError,
    deviceName: job.payload.deviceName,
  };
}

function reasonOf(err: unknown): string {
  if (typeof err === 'string' && err !== '') {
    return err;
  }

  const { message } = describeError(err);

  return message === '' ? 'unknown reason' : message;
}

export type PrintQueueWorkerDeps = {
  print: (payload: PrintPayload) => Promise<void>;
  onPrinted: (job: PrintJobSummary) => void;
  onFailed: (job: PrintJobSummary) => void;
};

export type PrintQueueWorker = {
  start: () => void;
  enqueue: (request: EnqueueRequest) => EnqueueResult;
  retryFailed: (id?: string) => number;
  notifyConnection: (isConnected: boolean) => void;
};

export function createPrintQueueWorker(deps: PrintQueueWorkerDeps): PrintQueueWorker {
  let running = false;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // The backoff lives in memory: after a restart the wait starts over, which is fine.
  const nextAttemptAt = new Map<string, number>();
  // Printed, but the file could not record it. Without this the loop would print
  // the same receipt again on every iteration.
  const printedUnrecorded = new Set<string>();

  function notify(callback: (job: PrintJobSummary) => void, job: PrintJobSummary): void {
    try {
      callback(job);
    } catch (err: unknown) {
      logger.error(`print-queue: could not notify the renderer about ${job.id}`, describeError(err));
    }
  }

  function fail(job: PrintJob, err: unknown): void {
    const reason = reasonOf(err);
    const attempts = job.attempts + 1;

    try {
      printQueueStore.incrementAttempt(job.id);

      if (attempts >= MAX_ATTEMPTS) {
        printQueueStore.markFailed(job.id, reason);
        nextAttemptAt.delete(job.id);
        notify(deps.onFailed, toSummary({ ...job, attempts, status: 'failed', lastError: reason }));
        return;
      }
    } catch (storeErr: unknown) {
      logger.error(`print-queue: could not record the failure of ${job.id}`, describeError(storeErr));
    }

    const wait = backoffMs(attempts);

    nextAttemptAt.set(job.id, Date.now() + wait);
    logger.warn(`print-queue: attempt ${attempts} of ${MAX_ATTEMPTS} for ${job.id} failed, reason: ${reason}`);
  }

  async function attempt(job: PrintJob): Promise<void> {
    try {
      await deps.print(job.payload);
    } catch (err: unknown) {
      fail(job, err);
      return;
    }

    // Print first, record after, mark in the API last (RN-03): from here on
    // nothing may print this job again.
    nextAttemptAt.delete(job.id);

    try {
      printQueueStore.markPrinted(job.id);
    } catch (err: unknown) {
      printedUnrecorded.add(job.id);
      logger.error(`print-queue: ${job.id} printed but the file could not record it`, describeError(err));
    }

    notify(deps.onPrinted, toSummary({ ...job, status: 'printed', lastError: null }));
  }

  function schedule(pending: PrintJob[]): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const times = pending.map(job => nextAttemptAt.get(job.id) ?? 0);

    if (times.length === 0) {
      return;
    }

    timer = setTimeout(kick, Math.max(Math.min(...times) - Date.now(), 0));
  }

  async function drain(): Promise<void> {
    for (;;) {
      const pending = printQueueStore.list('pending').filter(job => !printedUnrecorded.has(job.id));
      const now = Date.now();
      const job = pending.find(candidate => (nextAttemptAt.get(candidate.id) ?? 0) <= now);

      if (!job) {
        schedule(pending);
        return;
      }

      await attempt(job);
    }
  }

  // One loop at a time: a second trigger while it runs only asks for another lap.
  function kick(): void {
    if (running) {
      again = true;
      return;
    }

    running = true;

    drain()
      .catch((err: unknown) => {
        logger.error('print-queue: the worker loop failed', describeError(err));
        timer = setTimeout(kick, BACKOFF_MAX_MS);
      })
      .finally(() => {
        running = false;

        if (again) {
          again = false;
          kick();
        }
      });
  }

  // The unit is the whole response of the API, never one item: items of the same
  // response are never deduplicated against each other (two printers may share a
  // name and still carry different tickets), and the file is read and written once.
  function enqueue(request: EnqueueRequest): EnqueueResult {
    const jobs: PrintJob[] = request.items.map(item => ({
      id: item.id,
      kind: request.kind,
      payload: item.payload,
      orderUuid: request.orderUuid,
      label: request.label,
      attempts: 0,
      status: 'pending',
      createdAt: Date.now(),
      lastError: null,
    }));

    if (!jobs.every(isPrintJob)) {
      throw new Error('invalid print job');
    }

    if (jobs.length === 0) {
      return 'duplicate';
    }

    if (request.orderUuid !== undefined) {
      // The ids are new on every attempt, so they cannot identify the work: after a
      // restart the scan brings the same order with new ids. The work is order + kind.
      const sameWork = printQueueStore
        .list()
        .filter(existing => existing.orderUuid === request.orderUuid && existing.kind === request.kind);

      // Only the scan asks "was it printed?". An event is the operator asking again
      // ("Imprimir" in the panel re-emits printOrder), and holding it back would
      // swallow the reprint.
      if (request.source === 'scan' && sameWork.some(existing => existing.status === 'printed')) {
        logger.info(`print-queue: ${request.kind} of ${request.orderUuid} already printed, not enqueued`);
        return 'already-printed';
      }

      // Waiting (pending) is waiting for both sources: it will come out anyway. A
      // failed sibling stops the scan, which would otherwise requeue it on every
      // reconnection and hide the failure the operator was told about; an event
      // goes through as a new batch, because the operator is acting on it now.
      const blocking = request.source === 'scan' ? ['pending', 'failed'] : ['pending'];

      if (sameWork.some(existing => blocking.includes(existing.status))) {
        logger.info(`print-queue: ${request.kind} of ${request.orderUuid} already in the queue, ignored`);
        return 'duplicate';
      }
    }

    if (printQueueStore.enqueueMany(jobs) === 0) {
      return 'duplicate';
    }

    kick();

    return 'enqueued';
  }

  function retryFailed(id?: string): number {
    const count = printQueueStore.resetFailed(id);

    if (count > 0) {
      kick();
    }

    return count;
  }

  function notifyConnection(isConnected: boolean): void {
    if (!isConnected) {
      return;
    }

    // A reconnection is a reason to try now, not after the wait that was left.
    nextAttemptAt.clear();
    kick();
  }

  return { start: kick, enqueue, retryFailed, notifyConnection };
}
