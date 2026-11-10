import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrintJob } from 'shared/printQueue';

const electron = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => electron.userData }, BrowserWindow: vi.fn() }));
vi.mock('../../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const printReceipt = vi.hoisted(() => vi.fn());

vi.mock('../../ipc-events/onRawPrint', () => ({ printReceipt }));

import { onDiscardJob } from '../../ipc-events/onDiscardJob';
import { onReprintJob } from '../../ipc-events/onReprintJob';
import { onQueueState } from '../../ipc-events/onQueueState';
import { bootPrintQueue } from '../print-queue';
import { printQueueStore } from '../print-queue-store';

const SECRET = '<html>Maria, Rua das Flores 12, tel 11 99999-0000</html>';

function job(id: string, status: PrintJob['status']): PrintJob {
  return {
    id,
    kind: 'order-created',
    payload: { content: SECRET, copies: 1, deviceName: 'Cozinha', id },
    orderUuid: `order-${id}`,
    label: 'o pedido #1',
    attempts: 3,
    status,
    createdAt: Date.now(),
    lastError: status === 'failed' ? 'Print job failed' : null,
  };
}

describe('queue channels', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'print-ipc-'));
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('queueState never lets the receipt content cross to the renderer', () => {
    printQueueStore.enqueue(job('pending', 'pending'));
    printQueueStore.enqueue(job('failed', 'failed'));
    // The history reads the printed ones too.
    printQueueStore.enqueue(job('printed', 'printed'));

    const state = onQueueState();
    const wire = JSON.stringify(structuredClone(state));

    expect(state.map(summary => summary.id)).toEqual(['pending', 'failed', 'printed']);
    expect(wire).not.toContain(SECRET);
    expect(wire).not.toContain('Maria');
    expect(wire).not.toContain('content');
    expect(wire).not.toContain('payload');
    expect(state[1]).toMatchObject({ id: 'failed', status: 'failed', deviceName: 'Cozinha', attempts: 3 });
  });

  it('queueState carries the copies of the payload, and only that', () => {
    printQueueStore.enqueue({
      ...job('two', 'failed'),
      payload: { content: SECRET, copies: 2, deviceName: null, id: 'two' },
    });

    const [summary] = onQueueState();

    expect(summary.copies).toBe(2);
    expect(Object.keys(summary)).not.toContain('payload');
    expect(Object.keys(summary)).not.toContain('content');
  });

  it('queueState carries the instant of the next attempt of a job that failed and waits', async () => {
    printReceipt.mockRejectedValue('Print job failed');
    printQueueStore.enqueue(job('waiting', 'pending'));
    const before = Date.now();

    bootPrintQueue({ isDestroyed: () => false, webContents: { send: vi.fn() } } as never);
    await vi.waitFor(() => expect(onQueueState()[0].nextAttemptAt).toBeGreaterThan(before));

    expect(onQueueState()[0]).toMatchObject({ id: 'waiting', status: 'pending' });
  });

  it('queueState says which jobs can still be reprinted, and only those', () => {
    printQueueStore.enqueue(job('printed', 'printed'));
    printQueueStore.enqueue(job('failed', 'failed'));
    printQueueStore.enqueue(job('pending', 'pending'));
    printQueueStore.enqueue({
      ...job('bare', 'printed'),
      payload: { content: '', copies: 1, deviceName: null, id: 'bare' },
    });

    const flag = (id: string): boolean | undefined => onQueueState().find(s => s.id === id)?.reprintable;

    expect(flag('printed')).toBe(true);
    expect(flag('failed')).toBe(true);
    expect(flag('pending')).toBe(false);
    expect(flag('bare')).toBe(false);
  });

  it('queue:reprint puts a printed job back to pending with the same id and the original payload, and announces', async () => {
    const send = vi.fn();
    let release: () => void = () => undefined;
    // Held, not never-settling: the worker is a singleton and a stuck loop would starve the next tests.
    printReceipt.mockReturnValue(new Promise<void>(resolve => (release = resolve)));
    printQueueStore.enqueue(job('printed', 'printed'));
    bootPrintQueue({ isDestroyed: () => false, webContents: { send } } as never);
    send.mockClear();

    expect(onReprintJob({} as never, 'printed')).toBe(true);

    const [again] = printQueueStore.list();

    expect(printQueueStore.list()).toHaveLength(1);
    expect(again).toMatchObject({ id: 'printed', status: 'pending', attempts: 0, lastError: null });
    expect(again.payload).toEqual(job('printed', 'printed').payload);
    expect(send).toHaveBeenCalledWith('queue:changed', undefined);
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalledWith(job('printed', 'printed').payload));

    release();
    await vi.waitFor(() => expect(printQueueStore.list('printed')).toHaveLength(1));
  });

  it('queue:reprint on a pending job refuses and leaves the file alone', () => {
    printReceipt.mockReturnValue(new Promise(() => undefined));
    printQueueStore.enqueue(job('pending', 'pending'));
    const before = fs.readFileSync(path.join(electron.userData, 'print-queue.ndjson'), 'utf8');

    expect(onReprintJob({} as never, 'pending')).toBe(false);

    expect(fs.readFileSync(path.join(electron.userData, 'print-queue.ndjson'), 'utf8')).toBe(before);
  });

  it('queue:reprint on an id that does not exist returns false', () => {
    expect(onReprintJob({} as never, 'nope')).toBe(false);
  });

  it('queue:discard removes a failed job from the file and announces queue:changed', async () => {
    const send = vi.fn();
    printQueueStore.enqueue(job('failed', 'failed'));
    bootPrintQueue({ isDestroyed: () => false, webContents: { send } } as never);
    send.mockClear();

    expect(onDiscardJob({} as never, 'failed')).toBe(true);

    expect(printQueueStore.list()).toEqual([]);
    expect(send).toHaveBeenCalledWith('queue:changed', undefined);
  });

  it('queue:discard on a pending job refuses and removes nothing', () => {
    printQueueStore.enqueue(job('pending', 'pending'));
    printReceipt.mockReturnValue(new Promise(() => undefined));

    expect(onDiscardJob({} as never, 'pending')).toBe(false);

    expect(printQueueStore.list().map(item => item.id)).toEqual(['pending']);
  });

  it('queue:discard on an id that does not exist returns false without throwing', () => {
    expect(onDiscardJob({} as never, 'nope')).toBe(false);
  });

  it('a discarded job does not come back when the file is read again (the restart)', () => {
    printQueueStore.enqueue(job('failed', 'failed'));
    printQueueStore.enqueue(job('kept', 'failed'));

    onDiscardJob({} as never, 'failed');

    expect(printQueueStore.list().map(item => item.id)).toEqual(['kept']);
  });

  it('boot tidies the file and picks up what the last session left', async () => {
    const file = path.join(electron.userData, 'print-queue.ndjson');
    fs.writeFileSync(file, `not json\n${JSON.stringify(job('left', 'pending'))}\n`);
    printReceipt.mockResolvedValue(undefined);

    bootPrintQueue({ isDestroyed: () => false, webContents: { send: vi.fn() } } as never);
    await vi.waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1));

    expect(fs.readFileSync(file, 'utf8')).not.toContain('not json');
  });
});
