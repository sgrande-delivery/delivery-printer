import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ onChanged: null as null | (() => void), send: vi.fn() }));

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: vi.fn() }));
vi.mock('../../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../ipc-events/onRawPrint', () => ({ printReceipt: vi.fn() }));
vi.mock('../print-queue-store', () => ({
  printQueueStore: { compact: vi.fn(), pruneOlderThan: vi.fn() },
}));
vi.mock('../print-queue-worker', () => ({
  createPrintQueueWorker: (deps: { onChanged: () => void }) => {
    h.onChanged = deps.onChanged;

    return { start: vi.fn() };
  },
}));

import { EVENT_CHANNELS } from 'shared/ipcChannels';
import { bootPrintQueue, onQueueChanged } from '../print-queue';

function announce(): void {
  h.onChanged?.();
}

describe('onQueueChanged', () => {
  beforeEach(() => {
    h.send.mockClear();
    bootPrintQueue({ isDestroyed: () => false, webContents: { send: h.send } } as never);
  });

  it('notifies a listener on every change', () => {
    const listener = vi.fn();
    const off = onQueueChanged(listener);

    announce();
    announce();

    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('still sends to the window, first, when a listener throws, and the others run', () => {
    const order: string[] = [];

    h.send.mockImplementation(() => order.push('send'));
    const bad = vi.fn(() => {
      order.push('bad');
      throw new Error('boom');
    });
    const good = vi.fn(() => order.push('good'));
    const offBad = onQueueChanged(bad);
    const offGood = onQueueChanged(good);

    expect(() => announce()).not.toThrow();

    expect(order).toEqual(['send', 'bad', 'good']);
    expect(h.send).toHaveBeenCalledWith(EVENT_CHANNELS.queueChanged, undefined);
    offBad();
    offGood();
  });

  it('stops notifying after the returned function is called', () => {
    const listener = vi.fn();

    onQueueChanged(listener)();
    announce();

    expect(listener).not.toHaveBeenCalled();
  });

  it('survives a listener that unsubscribes itself during the notification', () => {
    const second = vi.fn();
    const off: () => void = onQueueChanged(() => off());
    const offSecond = onQueueChanged(second);

    announce();

    expect(second).toHaveBeenCalledTimes(1);
    offSecond();
  });
});
