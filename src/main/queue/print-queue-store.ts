import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { describeError } from 'shared/describeError';
import { writeFileAtomic } from '../atomicFile';
import { logger } from '../logger';
import { MAX_AGE_MS } from 'shared/queueLimits';
import type { PrintJob, PrintJobKind, PrintJobStatus } from 'shared/printQueue';

const QUEUE_FILE = 'print-queue.ndjson';

// Each job carries the whole receipt HTML (spec, decision 1), so the count is
// what bounds the disk use (RN-04).
export const MAX_JOBS = 200;
export { MAX_AGE_MS };

const KINDS: readonly PrintJobKind[] = ['order-created', 'order-dispatched', 'board', 'board-billing', 'test'];
const STATUSES: readonly PrintJobStatus[] = ['pending', 'printed', 'failed'];

function queuePath(): string {
  return path.join(app.getPath('userData'), QUEUE_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPrintJob(value: unknown): value is PrintJob {
  if (!isRecord(value) || !isRecord(value.payload)) {
    return false;
  }

  const { payload } = value;

  return (
    typeof value.id === 'string' &&
    KINDS.includes(value.kind as PrintJobKind) &&
    STATUSES.includes(value.status as PrintJobStatus) &&
    typeof value.attempts === 'number' &&
    typeof value.createdAt === 'number' &&
    (value.lastError === null || typeof value.lastError === 'string') &&
    (value.orderUuid === undefined || typeof value.orderUuid === 'string') &&
    (value.label === undefined || typeof value.label === 'string') &&
    typeof payload.content === 'string' &&
    typeof payload.copies === 'number' &&
    (payload.deviceName === null || typeof payload.deviceName === 'string') &&
    typeof payload.id === 'string'
  );
}

function serialize(jobs: PrintJob[]): string {
  return jobs.map(job => `${JSON.stringify(job)}\n`).join('');
}

type ReadResult = { jobs: PrintJob[]; discarded: number };

// Never throws, and never writes: a queue file that cannot be read must not stop
// the app from opening, and a read must not destroy what it could not read (that
// is compact(), below). Only the line number is logged, not its content, which
// is a receipt with the customer's data.
function readJobs(): ReadResult {
  let raw: string;

  try {
    raw = fs.readFileSync(queuePath(), 'utf8');
  } catch (err: unknown) {
    if (!(isRecord(err) && err.code === 'ENOENT')) {
      logger.error('print-queue: could not read the queue file', describeError(err));
    }

    return { jobs: [], discarded: 0 };
  }

  const jobs: PrintJob[] = [];
  let discarded = 0;

  raw.split('\n').forEach((line, index) => {
    if (line.trim() === '') {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(line);

      if (isPrintJob(parsed)) {
        jobs.push(parsed);
        return;
      }

      logger.warn(`print-queue: discarded line ${index + 1}, reason: not a print job`);
    } catch {
      logger.warn(`print-queue: discarded line ${index + 1}, reason: not valid JSON`);
    }

    discarded += 1;
  });

  return { jobs, discarded };
}

function writeJobs(jobs: PrintJob[]): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileAtomic(queuePath(), serialize(jobs));
}

// Printed first (already done), then failed (someone is told), then pending, and
// the oldest of each group goes first.
function dropOverflow(jobs: PrintJob[]): PrintJob[] {
  let kept = jobs;

  for (const status of ['printed', 'failed', 'pending'] as const) {
    while (kept.length > MAX_JOBS) {
      const victim = kept.find(job => job.status === status);

      if (!victim) {
        break;
      }

      logger.warn(`print-queue: dropped job ${victim.id} (${victim.status}), reason: queue limit of ${MAX_JOBS}`);
      kept = kept.filter(job => job !== victim);
    }
  }

  return kept;
}

function update(id: string, change: (job: PrintJob) => PrintJob): PrintJob | null {
  const { jobs } = readJobs();
  const index = jobs.findIndex(job => job.id === id);

  if (index === -1) {
    logger.warn(`print-queue: job ${id} not found`);
    return null;
  }

  const changed = change(jobs[index]);

  jobs[index] = changed;
  writeJobs(jobs);

  return changed;
}

// Writes can throw (disk full, permission): the caller decides what the operator
// sees, because a job that did not reach the disk is a receipt at risk.
export const printQueueStore = {
  // Same id twice is ignored: the id is the job's identity.
  enqueue(job: PrintJob): boolean {
    const { jobs } = readJobs();

    if (jobs.some(existing => existing.id === job.id)) {
      logger.warn(`print-queue: job ${job.id} already in the queue, ignored`);
      return false;
    }

    writeJobs(dropOverflow([...jobs, job]));
    logger.info(`print-queue: enqueued ${job.id} (${job.kind})`);

    return true;
  },

  // All or nothing: one read, one atomic write. Returns how many were added
  // (ids already in the file are skipped).
  enqueueMany(newJobs: PrintJob[]): number {
    const { jobs } = readJobs();
    const fresh = newJobs.filter(job => !jobs.some(existing => existing.id === job.id));

    if (fresh.length === 0) {
      return 0;
    }

    writeJobs(dropOverflow([...jobs, ...fresh]));
    logger.info(`print-queue: enqueued ${fresh.map(job => `${job.id} (${job.kind})`).join(', ')}`);

    return fresh.length;
  },

  list(status?: PrintJobStatus): PrintJob[] {
    const { jobs } = readJobs();

    return status ? jobs.filter(job => job.status === status) : jobs;
  },

  // The record stays (the worker needs it to know the order was printed and to
  // mark it in the API) but the receipt HTML does not: it is the heavy part.
  markPrinted(id: string): void {
    const changed = update(id, job => ({
      ...job,
      status: 'printed',
      lastError: null,
      payload: { ...job.payload, content: '' },
    }));

    if (changed) {
      logger.info(`print-queue: printed ${id}`);
    }
  },

  markFailed(id: string, reason: string): void {
    const changed = update(id, job => ({ ...job, status: 'failed', lastError: reason }));

    if (changed) {
      logger.warn(`print-queue: failed ${id}, reason: ${reason}`);
    }
  },

  // Manual retry: failed goes back to pending with a fresh count. Returns how
  // many jobs were put back.
  resetFailed(id?: string): number {
    const { jobs } = readJobs();
    let count = 0;

    const next = jobs.map(job => {
      if (job.status !== 'failed' || (id !== undefined && job.id !== id)) {
        return job;
      }

      count += 1;
      logger.info(`print-queue: retry requested for ${job.id}`);

      return { ...job, status: 'pending' as const, attempts: 0, lastError: null };
    });

    if (count > 0) {
      writeJobs(next);
    }

    return count;
  },

  // Only a failed job leaves: anything else is a receipt that has not come out, or the
  // ledger that keeps the scan from printing an order twice.
  removeFailed(id: string): 'removed' | 'not-found' | 'not-failed' {
    const { jobs } = readJobs();
    const target = jobs.find(job => job.id === id);

    if (!target) {
      logger.warn(`print-queue: job ${id} not found`);
      return 'not-found';
    }

    if (target.status !== 'failed') {
      return 'not-failed';
    }

    writeJobs(jobs.filter(job => job !== target));
    logger.info(`print-queue: discarded ${id}`);

    return 'removed';
  },

  incrementAttempt(id: string): void {
    update(id, job => ({ ...job, attempts: job.attempts + 1 }));
  },

  // Removes every job created more than maxAgeMs ago, whatever its status.
  pruneOlderThan(maxAgeMs: number = MAX_AGE_MS): number {
    const { jobs } = readJobs();
    const now = Date.now();
    const kept = jobs.filter(job => now - job.createdAt <= maxAgeMs);

    jobs
      .filter(job => !kept.includes(job))
      .forEach(job => {
        logger.warn(`print-queue: dropped job ${job.id} (${job.status}), reason: older than ${maxAgeMs} ms`);
      });

    if (kept.length !== jobs.length) {
      writeJobs(kept);
    }

    return jobs.length - kept.length;
  },

  // Rewrites the file without the lines that could not be read, and returns how
  // many went away. It is a decision of the caller, not an effect of reading:
  // the log carries only the line number, so after this there is nothing left
  // for the support to look at. The boot is the place to call it.
  compact(): number {
    const { jobs, discarded } = readJobs();

    if (discarded > 0) {
      writeJobs(jobs);
    }

    return discarded;
  },
};
