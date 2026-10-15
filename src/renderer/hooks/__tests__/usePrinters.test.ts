import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { renderHook, waitFor } from '@testing-library/react';
import { usePrinters } from '../usePrinters';
import { fetchPrinters } from 'renderer/services/printers';
import type { Printer } from 'renderer/types/printer';

vi.mock('renderer/services/printers', () => ({ fetchPrinters: vi.fn() }));

function printer(name: string, id = 1): Printer {
  return { id, name, address: '', activated: true, station: 'kitchen', paper_width: 80, copies: 1 };
}

function devices(...names: string[]) {
  return names.map(name => ({ name, displayName: name, isDefault: false }));
}

describe('usePrinters', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset();
    vi.mocked(window.electron.listPrinters).mockReset();
  });

  it('resolves a name that differs only in letter case, like printReceipt does', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('cozinha')]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('COZINHA'));

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers[0].resolvedDevice).toBe('COZINHA');
    expect(result.current.unregistered).toEqual([]);
  });

  it('returns null for a name no device has, and lists the unregistered device', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('EPSON TM-T20'));

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers[0].resolvedDevice).toBeNull();
    expect(result.current.unregistered.map(d => d.name)).toEqual(['EPSON TM-T20']);
  });

  it('does not match with surrounding spaces, because printReceipt does not either', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha ')]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Cozinha'));

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers[0].resolvedDevice).toBeNull();
  });

  // printers.name has no unique index (measured in #17): two station tickets on the same
  // physical printer are two rows with the same name, and the print sends both to that
  // device. The screen has to agree with the print instead of hiding one of them.
  it('resolves both printers registered under the same name, to the same device', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha', 1), printer('cozinha', 2)]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('COZINHA'));

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers).toHaveLength(2);
    expect(result.current.printers.map(p => p.resolvedDevice)).toEqual(['COZINHA', 'COZINHA']);
    expect(result.current.unregistered).toEqual([]);
  });

  it('leaves every printer unresolved, without breaking, when there are no devices', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('A', 1), printer('B', 2)]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers.map(p => p.resolvedDevice)).toEqual([null, null]);
    expect(result.current.unregistered).toEqual([]);
  });

  it('reports devicesRead false when no device came back, true otherwise', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('A')]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    const empty = renderHook(() => usePrinters());

    await waitFor(() => expect(empty.result.current.status).toBe('ready'));
    expect(empty.result.current.devicesRead).toBe(false);

    vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('X'));
    const full = renderHook(() => usePrinters());

    await waitFor(() => expect(full.result.current.status).toBe('ready'));
    expect(full.result.current.devicesRead).toBe(true);
  });

  it('logs a warning on 403, so support can see the missing role', async () => {
    const err = new AxiosError('forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 403,
      statusText: '',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    vi.mocked(fetchPrinters).mockRejectedValue(err);
    vi.mocked(window.electron.log).mockClear();

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('forbidden'));
    expect(window.electron.log).toHaveBeenCalledWith('warn', expect.stringContaining('403'), undefined);
  });
});
