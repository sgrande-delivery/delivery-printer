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

    const state = onQueueState();
    const wire = JSON.stringify(structuredClone(state));

    expect(state).toHaveLength(2);
    expect(wire).not.toContain(SECRET);
    expect(wire).not.toContain('Maria');
    expect(wire).not.toContain('content');
    expect(wire).not.toContain('payload');
    expect(state[1]).toMatchObject({ id: 'failed', status: 'failed', deviceName: 'Cozinha', attempts: 3 });
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
