import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';

const mocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('../logger', () => ({ logger: { error: mocks.error } }));

const system = vi.hoisted(() => ({ defaultName: null as string | null, asked: 0 }));

vi.mock('../defaultPrinter', () => ({
  readDefaultPrinterName: async () => {
    system.asked += 1;
    return system.defaultName;
  },
}));

import { onListPrinters } from '../ipc-events/onListPrinters';

function eventWith(getPrintersAsync: () => Promise<unknown[]>): IpcMainInvokeEvent {
  return { sender: { getPrintersAsync } } as unknown as IpcMainInvokeEvent;
}

describe('onListPrinters', () => {
  beforeEach(() => {
    mocks.error.mockClear();
    system.defaultName = null;
    system.asked = 0;
  });

  // Electron 43 does not flag the default: the "(padrão)" of the screen comes from the operating system.
  it('marks the printer the operating system names as default, ignoring case', async () => {
    system.defaultName = 'epson';

    const result = await onListPrinters(
      eventWith(async () => [
        { name: 'ZEBRA', displayName: 'Zebra', description: 'x', options: {} },
        { name: 'EPSON', displayName: 'Balcao', description: 'y', options: {} },
      ])
    );

    expect(result).toEqual([
      { name: 'EPSON', displayName: 'Balcao', isDefault: true },
      { name: 'ZEBRA', displayName: 'Zebra', isDefault: false },
    ]);
  });

  it('does not ask the system when a printer already came flagged', async () => {
    await onListPrinters(eventWith(async () => [{ name: 'EPSON', displayName: 'EPSON', isDefault: true }]));

    expect(system.asked).toBe(0);
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
