import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { act, renderHook, waitFor } from '@testing-library/react';
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
  });

  it('returns null for a name no device has', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('EPSON TM-T20'));

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers[0].resolvedDevice).toBeNull();
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
  });

  it('leaves every printer unresolved, without breaking, when there are no devices', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('A', 1), printer('B', 2)]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);

    const { result } = renderHook(() => usePrinters());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.printers.map(p => p.resolvedDevice)).toEqual([null, null]);
  });

  it('reports devicesRead false when no device came back, true otherwise', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('A')]);
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    const empty = renderHook(() => usePrinters());

    await waitFor(() => expect(empty.result.current.status).toBe('ready'));
    expect(empty.result.current.devicesRead).toBe(false);
    // The list is shared by every mounted reader: a second one only starts fresh once the first is gone.
    empty.unmount();

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

  describe('one list for every reader', () => {
    it('asks the API and the spooler once for two readers mounted together', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
      vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Cozinha'));

      const sidebar = renderHook(() => usePrinters());
      const screen = renderHook(() => usePrinters());

      await waitFor(() => expect(screen.result.current.status).toBe('ready'));
      expect(sidebar.result.current.printers).toEqual(screen.result.current.printers);
      expect(fetchPrinters).toHaveBeenCalledTimes(1);
      expect(window.electron.listPrinters).toHaveBeenCalledTimes(1);
    });

    it('shows a change to every reader at once: what one refreshes, the other reads', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
      vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Outra'));

      const sidebar = renderHook(() => usePrinters());
      const screen = renderHook(() => usePrinters());
      await waitFor(() => expect(screen.result.current.status).toBe('ready'));
      expect(sidebar.result.current.printers[0].resolvedDevice).toBeNull();

      vi.mocked(fetchPrinters).mockResolvedValue([printer('Outra')]);
      act(() => screen.result.current.refresh());

      await waitFor(() => expect(sidebar.result.current.printers[0].resolvedDevice).toBe('Outra'));
    });

    it('keeps the list while one reader leaves, and starts over when the last one does', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
      vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Cozinha'));

      const sidebar = renderHook(() => usePrinters());
      const screen = renderHook(() => usePrinters());
      await waitFor(() => expect(screen.result.current.status).toBe('ready'));

      screen.unmount();
      expect(sidebar.result.current.status).toBe('ready');
      expect(fetchPrinters).toHaveBeenCalledTimes(1);

      sidebar.unmount();
      const again = renderHook(() => usePrinters());

      expect(again.result.current.status).toBe('loading');
      await waitFor(() => expect(again.result.current.status).toBe('ready'));
      expect(fetchPrinters).toHaveBeenCalledTimes(2);
    });

    it('revalidate reads again when idle and does nothing while a read is already in flight', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
      vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Cozinha'));
      const { result } = renderHook(() => usePrinters());

      act(() => result.current.revalidate());
      expect(fetchPrinters).toHaveBeenCalledTimes(1);

      await waitFor(() => expect(result.current.status).toBe('ready'));
      act(() => result.current.revalidate());

      expect(fetchPrinters).toHaveBeenCalledTimes(2);
      // Back to ready without blanking the screen: a revalidate is not a reload.
      expect(result.current.status).toBe('ready');
    });

    it('reads again when the window gets the focus back, and stops listening with the last reader', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
      vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Cozinha'));
      const { result, unmount } = renderHook(() => usePrinters());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(fetchPrinters).toHaveBeenCalledTimes(2);

      await waitFor(() => expect(result.current.status).toBe('ready'));
      unmount();
      window.dispatchEvent(new Event('focus'));
      expect(fetchPrinters).toHaveBeenCalledTimes(2);
    });

    it('drops an answer that arrives after the last reader left', async () => {
      let finish = (_printers: Printer[]): void => undefined;
      vi.mocked(fetchPrinters).mockImplementation(
        () =>
          new Promise<Printer[]>(resolve => {
            finish = resolve;
          })
      );
      vi.mocked(window.electron.listPrinters).mockResolvedValue(devices('Cozinha'));
      const first = renderHook(() => usePrinters());
      first.unmount();

      vi.mocked(fetchPrinters).mockResolvedValue([]);
      const second = renderHook(() => usePrinters());
      await waitFor(() => expect(second.result.current.status).toBe('ready'));

      await act(async () => {
        finish([printer('Velha')]);
      });

      expect(second.result.current.printers).toEqual([]);
    });
  });
});
