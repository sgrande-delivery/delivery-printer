import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EnqueueRequest, PrintJob, PrintJobSummary, PrintPayload } from 'shared/printQueue';

const electron = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('../../logger', () => ({ logger: log }));

import { printQueueStore } from '../print-queue-store';
import { createPrintQueueWorker, MAX_ATTEMPTS, PrintQueueWorker, toSummary } from '../print-queue-worker';

function item(id: string, deviceName: string | null = 'Cozinha'): EnqueueRequest['items'][number] {
  return { id, payload: { content: `<html>${id}</html>`, copies: 1, deviceName, id: `file-${id}` } };
}

function request(id: string, overrides: Partial<EnqueueRequest> = {}): EnqueueRequest {
  return {
    kind: 'order-created',
    source: 'event',
    orderUuid: `order-${id}`,
    label: `o pedido ${id}`,
    items: [item(id)],
    ...overrides,
  };
}

function seed(jobs: PrintJob[]): void {
  fs.writeFileSync(
    path.join(electron.userData, 'print-queue.ndjson'),
    jobs.map(job => `${JSON.stringify(job)}\n`).join('')
  );
}

function pendingJob(id: string): PrintJob {
  return {
    id,
    kind: 'order-created',
    payload: { content: `<html>${id}</html>`, copies: 1, deviceName: 'Cozinha', id: `file-${id}` },
    orderUuid: `order-${id}`,
    label: `o pedido ${id}`,
    attempts: 0,
    status: 'pending',
    createdAt: Date.now(),
    lastError: null,
  };
}

const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('print queue worker', () => {
  const print = vi.fn<(payload: PrintPayload) => Promise<void>>();
  const onPrinted = vi.fn<(job: PrintJobSummary) => void>();
  const onFailed = vi.fn<(job: PrintJobSummary) => void>();
  const onChanged = vi.fn<() => void>();

  function newWorker(): PrintQueueWorker {
    return createPrintQueueWorker({ print, onPrinted, onFailed, onChanged });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'print-worker-'));
    print.mockReset().mockResolvedValue(undefined);
    onPrinted.mockReset();
    onFailed.mockReset();
    onChanged.mockReset();
    log.info.mockClear();
    log.warn.mockClear();
    log.error.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('prints once after failing twice, recording both attempts, with the backoff between them', async () => {
    print.mockRejectedValueOnce('Print job failed').mockRejectedValueOnce('Print job failed');
    const worker = newWorker();

    worker.enqueue(request('a'));
    await settle();
    expect(print).toHaveBeenCalledTimes(1);

    await settle(1999);
    expect(print).toHaveBeenCalledTimes(1);
    await settle(1);
    expect(print).toHaveBeenCalledTimes(2);

    await settle(4000);
    expect(print).toHaveBeenCalledTimes(3);

    const [job] = printQueueStore.list();
    expect(job.status).toBe('printed');
    expect(job.attempts).toBe(2);
    expect(onPrinted).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();

    await settle(60000);
    expect(print).toHaveBeenCalledTimes(3);
  });

  it('becomes failed past the limit and tells the renderer once', async () => {
    print.mockRejectedValue('Print job failed');
    const worker = newWorker();

    worker.enqueue(request('a'));
    await settle(60000);

    expect(print).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    const [job] = printQueueStore.list();
    expect(job.status).toBe('failed');
    expect(job.lastError).toBe('Print job failed');
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0][0]).toMatchObject({ id: 'a', status: 'failed', deviceName: 'Cozinha' });
    expect(onPrinted).not.toHaveBeenCalled();

    await settle(120000);
    expect(print).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('announces every change the screen shows, a failed attempt that leaves the job pending included', async () => {
    print.mockRejectedValue('Print job failed');
    const worker = newWorker();

    worker.enqueue(request('a'));
    expect(onChanged).toHaveBeenCalledTimes(1);

    // The screen shows the attempts and the instant of the next one: failures at 0 s, 2 s and 6 s.
    await settle(10000);
    expect(onChanged).toHaveBeenCalledTimes(4);

    // Failures at 14 s (pending) and 30 s (the fifth: failed).
    await settle(60000);
    expect(printQueueStore.list()[0].status).toBe('failed');
    expect(onChanged).toHaveBeenCalledTimes(6);

    print.mockResolvedValue(undefined);
    expect(worker.retryFailed()).toBe(1);
    expect(onChanged).toHaveBeenCalledTimes(7);

    await settle();
    expect(printQueueStore.list()[0].status).toBe('printed');
    expect(onChanged).toHaveBeenCalledTimes(8);
  });

  it('does not announce a failed attempt the store could not record', async () => {
    print.mockRejectedValue('Print job failed');
    const spy = vi.spyOn(printQueueStore, 'incrementAttempt').mockImplementation(() => {
      throw new Error('ENOSPC');
    });
    const worker = newWorker();

    worker.enqueue(request('a'));
    onChanged.mockClear();
    await settle(10000);

    expect(onChanged).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('publishes the instant of the next attempt while the job waits, and forgets it after', async () => {
    print.mockRejectedValueOnce('Print job failed').mockResolvedValue(undefined);
    const worker = newWorker();
    const start = Date.now();

    worker.enqueue(request('a'));
    expect(worker.nextAttemptOf('a')).toBeUndefined();

    await settle();
    expect(worker.nextAttemptOf('a')).toBe(start + 2000);

    await settle(2000);
    expect(printQueueStore.list()[0].status).toBe('printed');
    expect(worker.nextAttemptOf('a')).toBeUndefined();
  });

  it('discardFailed removes a failed job from the file and announces it', async () => {
    print.mockRejectedValue('Print job failed');
    const worker = newWorker();
    worker.enqueue(request('a'));
    await settle(60000);
    expect(printQueueStore.list()[0].status).toBe('failed');
    onChanged.mockClear();

    expect(worker.discardFailed('a')).toBe(true);

    expect(printQueueStore.list()).toEqual([]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('discardFailed refuses a pending job: it is a receipt that is still going out', () => {
    print.mockReturnValue(new Promise(() => undefined));
    const worker = newWorker();
    worker.enqueue(request('a'));
    onChanged.mockClear();

    expect(worker.discardFailed('a')).toBe(false);

    expect(printQueueStore.list()).toHaveLength(1);
    expect(printQueueStore.list()[0].status).toBe('pending');
    expect(onChanged).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('refused to discard a'));
  });

  it('discardFailed refuses a printed job too: it is the ledger that keeps the scan from printing twice', () => {
    seed([{ ...pendingJob('a'), status: 'printed' }]);
    const worker = newWorker();

    expect(worker.discardFailed('a')).toBe(false);
    expect(printQueueStore.list()).toHaveLength(1);
  });

  it('discardFailed on an id that is gone returns false and does not throw', () => {
    const worker = newWorker();

    expect(worker.discardFailed('nope')).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('an announcement that throws does not fail the enqueue: the receipt is already on disk', () => {
    onChanged.mockImplementation(() => {
      throw new Error('the window is gone');
    });
    const worker = newWorker();

    expect(worker.enqueue(request('a'))).toBe('enqueued');
    expect(printQueueStore.list()).toHaveLength(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('retryFailed gives the job a fresh set of attempts', async () => {
    print.mockRejectedValue('Print job failed');
    const worker = newWorker();
    worker.enqueue(request('a'));
    await settle(60000);
    expect(printQueueStore.list()[0].status).toBe('failed');

    print.mockResolvedValue(undefined);
    expect(worker.retryFailed()).toBe(1);
    await settle();

    expect(printQueueStore.list()[0]).toMatchObject({ status: 'printed' });
    expect(onPrinted).toHaveBeenCalledTimes(1);
  });

  it('processes two jobs for the same printer one at a time, never together', async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];

    print.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active -= 1;
    });
    const worker = newWorker();

    worker.enqueue(request('a'));
    worker.enqueue(request('b'));
    await settle();

    expect(print).toHaveBeenCalledTimes(1);
    releases.shift()?.();
    await settle();
    expect(print).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await settle();

    expect(maxActive).toBe(1);
    expect(onPrinted.mock.calls.map(call => call[0].id)).toEqual(['a', 'b']);
  });

  it('two jobs already in the file at boot (kill -9) are printed one at a time', async () => {
    let active = 0;
    let maxActive = 0;

    print.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      active -= 1;
    });
    seed([pendingJob('a'), pendingJob('b')]);

    newWorker().start();
    await settle(1000);

    expect(print).toHaveBeenCalledTimes(2);
    expect(maxActive).toBe(1);
  });

  it('does not reprocess a job that is already printed, not even in a new process', async () => {
    newWorker().enqueue(request('a'));
    await settle();
    expect(print).toHaveBeenCalledTimes(1);

    const afterRestart = newWorker();
    afterRestart.start();
    afterRestart.notifyConnection(true);
    await settle(60000);

    expect(print).toHaveBeenCalledTimes(1);
  });

  it('does not print again when the file could not record the print', async () => {
    vi.spyOn(printQueueStore, 'markPrinted').mockImplementation(() => {
      throw new Error('disk full');
    });
    const worker = newWorker();

    worker.enqueue(request('a'));
    await settle(60000);

    expect(print).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalled();
  });

  it('a printed order that comes back with a new id after a restart is not printed again', async () => {
    newWorker().enqueue(request('first'));
    await settle();
    expect(print).toHaveBeenCalledTimes(1);

    // The scan after the restart: same order, a new id for the new attempt.
    const afterRestart = newWorker();
    const result = afterRestart.enqueue(request('second', { orderUuid: 'order-first', source: 'scan' }));
    await settle(60000);

    expect(result).toBe('already-printed');
    expect(print).toHaveBeenCalledTimes(1);
    expect(printQueueStore.list()).toHaveLength(1);
  });

  it('does not duplicate an order that is already waiting, whatever the source', async () => {
    print.mockRejectedValue('Print job failed');
    const worker = newWorker();

    expect(worker.enqueue(request('a', { orderUuid: 'o1' }))).toBe('enqueued');
    expect(worker.enqueue(request('b', { orderUuid: 'o1' }))).toBe('duplicate');
    expect(worker.enqueue(request('c', { orderUuid: 'o1', source: 'scan' }))).toBe('duplicate');
    expect(worker.enqueue(request('d', { orderUuid: 'o1', kind: 'order-dispatched' }))).toBe('enqueued');

    expect(printQueueStore.list().map(job => job.id)).toEqual(['a', 'd']);
  });

  it('keeps one job per item of the same response, even when two printers share a name', async () => {
    const worker = newWorker();

    const result = worker.enqueue(
      request('a', { orderUuid: 'o1', items: [item('k1', 'Cozinha'), item('k2', 'Cozinha'), item('b1', 'Bar')] })
    );
    await settle();

    expect(result).toBe('enqueued');
    expect(printQueueStore.list().map(job => job.id)).toEqual(['k1', 'k2', 'b1']);
    expect(print.mock.calls.map(call => call[0].content)).toEqual([
      '<html>k1</html>',
      '<html>k2</html>',
      '<html>b1</html>',
    ]);
  });

  it('the scan does not print again an order that was printed', async () => {
    newWorker().enqueue(request('a', { orderUuid: 'o1' }));
    await settle();
    expect(print).toHaveBeenCalledTimes(1);

    const result = newWorker().enqueue(request('b', { orderUuid: 'o1', source: 'scan' }));
    await settle();

    expect(result).toBe('already-printed');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('an event prints again an order that was printed: the operator asked for the reprint', async () => {
    newWorker().enqueue(request('a', { orderUuid: 'o1' }));
    await settle();

    const result = newWorker().enqueue(request('b', { orderUuid: 'o1', source: 'event' }));
    await settle();

    expect(result).toBe('enqueued');
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('an event is not swallowed by a failed sibling, but the scan leaves the failure alone', async () => {
    print.mockRejectedValue('Print job failed');
    const worker = newWorker();
    worker.enqueue(request('a', { orderUuid: 'o1' }));
    await settle(60000);
    expect(printQueueStore.list()[0].status).toBe('failed');

    expect(worker.enqueue(request('b', { orderUuid: 'o1', source: 'scan' }))).toBe('duplicate');

    print.mockResolvedValue(undefined);
    expect(worker.enqueue(request('c', { orderUuid: 'o1', source: 'event' }))).toBe('enqueued');
    await settle();

    expect(printQueueStore.list().map(job => `${job.id}:${job.status}`)).toEqual(['a:failed', 'c:printed']);
  });

  it('prints a dispatch receipt again after one was printed, because it is an explicit event', async () => {
    const worker = newWorker();

    worker.enqueue(request('a', { orderUuid: 'o1', kind: 'order-dispatched' }));
    await settle();
    const result = worker.enqueue(request('b', { orderUuid: 'o1', kind: 'order-dispatched' }));
    await settle();

    expect(result).toBe('enqueued');
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('recovers a board receipt (no orderUuid) that failed while the printer was off', async () => {
    print.mockRejectedValueOnce('Print job failed');
    const worker = newWorker();

    worker.enqueue(request('m', { kind: 'board', orderUuid: undefined }));
    await settle(2000);

    expect(print).toHaveBeenCalledTimes(2);
    expect(printQueueStore.list()[0].status).toBe('printed');
  });

  it('a reconnection skips the wait that was left', async () => {
    print.mockRejectedValueOnce('Print job failed');
    const worker = newWorker();

    worker.enqueue(request('a'));
    await settle();
    expect(print).toHaveBeenCalledTimes(1);

    worker.notifyConnection(true);
    await settle();
    expect(print).toHaveBeenCalledTimes(2);
  });

  it('refuses a request that would be discarded when read back', () => {
    const worker = newWorker();

    expect(() => worker.enqueue({ ...request('a'), kind: 'nope' as never })).toThrow('invalid print job');
    expect(printQueueStore.list()).toEqual([]);
  });

  describe('toSummary', () => {
    it('carries copies and the device, and never the receipt HTML', () => {
      const job = {
        ...pendingJob('a'),
        payload: { content: '<html>SECRET</html>', copies: 3, deviceName: 'Cozinha', id: 'f' },
      };

      const summary = toSummary(job);

      expect(summary).toMatchObject({ copies: 3, deviceName: 'Cozinha' });
      expect(JSON.stringify(summary)).not.toContain('SECRET');
      expect(Object.keys(summary)).not.toContain('payload');
    });

    it('carries nextAttemptAt only for a pending job', () => {
      expect(toSummary(pendingJob('a'), 123).nextAttemptAt).toBe(123);
      expect(toSummary(pendingJob('a'))).not.toHaveProperty('nextAttemptAt');
      expect(toSummary({ ...pendingJob('a'), status: 'failed' }, 123)).not.toHaveProperty('nextAttemptAt');
    });
  });
});
