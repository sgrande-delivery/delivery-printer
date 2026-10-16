import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

const mocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../logger', () => ({ logger: { error: mocks.error } }));

import { onListPrinters } from '../ipc-events/onListPrinters';

function eventWith(getPrintersAsync: () => Promise<unknown[]>): IpcMainInvokeEvent {
  return { sender: { getPrintersAsync } } as unknown as IpcMainInvokeEvent;
}

describe('onListPrinters', () => {
  beforeEach(() => {
    mocks.error.mockClear();
  });

  it('returns only the chosen fields, sorted by display name', async () => {
    const result = await onListPrinters(
      eventWith(async () => [
        { name: 'ZEBRA', displayName: 'Zebra', description: 'x', options: {}, isDefault: false },
        { name: 'EPSON', displayName: 'Balcao', description: 'y', options: {}, isDefault: true },
      ])
    );

    expect(result).toEqual([
      { name: 'EPSON', displayName: 'Balcao', isDefault: true },
      { name: 'ZEBRA', displayName: 'Zebra', isDefault: false },
    ]);
  });

  it('keeps two printers that share a name and treats a missing isDefault as false', async () => {
    const result = await onListPrinters(
      eventWith(async () => [
        { name: 'A', displayName: '' },
        { name: 'A', displayName: '' },
      ])
    );

    expect(result).toEqual([
      { name: 'A', displayName: 'A', isDefault: false },
      { name: 'A', displayName: 'A', isDefault: false },
    ]);
  });

  it('returns [] for an empty list without logging', async () => {
    await expect(onListPrinters(eventWith(async () => []))).resolves.toEqual([]);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('returns [] and logs when the spooler rejects', async () => {
    const result = await onListPrinters(
      eventWith(async () => {
        throw new Error('spooler down');
      })
    );

    expect(result).toEqual([]);
    expect(mocks.error).toHaveBeenCalledWith(
      'listing printers failed',
      expect.objectContaining({ message: 'spooler down' })
    );
  });
});
