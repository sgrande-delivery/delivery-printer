import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PrintJob } from 'shared/printQueue';

const electron = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => electron.userData }, BrowserWindow: vi.fn() }));
vi.mock('../main/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const printReceipt = vi.hoisted(() => vi.fn());

// Lives here and not under src/main: it imports the renderer hook, and the node program has no DOM.
// The physical printer is the only thing replaced: the queue file, the worker, the handlers and the
// announcement all run for real, and the renderer's hook sits on the other end of them.
vi.mock('../main/ipc-events/onRawPrint', () => ({ printReceipt }));

import { onDiscardJob } from '../main/ipc-events/onDiscardJob';
import { onQueueState } from '../main/ipc-events/onQueueState';
import { bootPrintQueue } from '../main/queue/print-queue';
import { printQueueStore } from '../main/queue/print-queue-store';
import { usePrintQueue } from 'renderer/hooks/usePrintQueue';

const SECRET = '<html>Maria, Rua das Flores 12</html>';

function failedJob(id: string): PrintJob {
  return {
    id,
    kind: 'order-created',
    payload: { content: SECRET, copies: 1, deviceName: 'Cozinha', id },
    orderUuid: `order-${id}`,
    label: 'o pedido #1',
    attempts: 5,
    status: 'failed',
    createdAt: Date.now(),
    lastError: 'Print job failed',
  };
}

// What `ipcRenderer.invoke` does to a value: a structured clone, not a shared reference.
const listeners = new Set<() => void>();

function announce(): void {
  listeners.forEach(listener => listener());
}

describe('the renderer hook on the real queue', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'print-renderer-'));
    listeners.clear();
    vi.mocked(window.electron.queueState)
      .mockReset()
      .mockImplementation(async () => structuredClone(onQueueState()));
    vi.mocked(window.electron.discardJob)
      .mockReset()
      .mockImplementation(async (id: string) => onDiscardJob({} as never, id));
    vi.mocked(window.electron.onQueueChanged)
      .mockReset()
      .mockImplementation(callback => {
        listeners.add(callback);

        return () => listeners.delete(callback);
      });
    bootPrintQueue({
      isDestroyed: () => false,
      webContents: { send: (channel: string) => channel === 'queue:changed' && announce() },
    } as never);
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('shows the failed job to both readers, never its HTML, and drops it from the file and from both when discarded', async () => {
    printQueueStore.enqueue(failedJob('f-1'));

    const badge = renderHook(() => usePrintQueue());
    const screen = renderHook(() => usePrintQueue());

    await waitFor(() => expect(screen.result.current.failed.map(job => job.id)).toEqual(['f-1']));
    expect(badge.result.current.failed.map(job => job.id)).toEqual(['f-1']);
    expect(JSON.stringify(screen.result.current)).not.toContain('Maria');

    let discarded = false;
    await act(async () => {
      discarded = await screen.result.current.discard('f-1');
    });

    expect(discarded).toBe(true);
    expect(printQueueStore.list()).toEqual([]);
    await waitFor(() => expect(badge.result.current.failed).toEqual([]));
    expect(screen.result.current.failed).toEqual([]);
  });

  it('asks the main once per announcement however many readers are mounted', async () => {
    printQueueStore.enqueue(failedJob('f-1'));
    const badge = renderHook(() => usePrintQueue());
    const screen = renderHook(() => usePrintQueue());
    await waitFor(() => expect(screen.result.current.loaded).toBe(true));
    vi.mocked(window.electron.queueState).mockClear();

    await act(async () => {
      announce();
    });

    expect(window.electron.queueState).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(1);
    badge.unmount();
    screen.unmount();
    expect(listeners.size).toBe(0);
  });
});
