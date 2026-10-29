import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrintJobSummary } from 'shared/printQueue';
import { usePrintQueue } from '../usePrintQueue';

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 0,
    status: 'pending',
    createdAt: 0,
    lastError: null,
    deviceName: 'Cozinha',
    copies: 1,
    reprintable: false,
    ...overrides,
  };
}

describe('usePrintQueue', () => {
  beforeEach(() => {
    vi.mocked(window.electron.queueState).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.retryFailed).mockReset().mockResolvedValue(1);
    vi.mocked(window.electron.discardJob).mockReset().mockResolvedValue(true);
    vi.mocked(window.electron.onQueueChanged)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  it('reflects the state from the channel, splitting pending, failed and printed', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([
      job({ id: 'a' }),
      job({ id: 'b', status: 'failed' }),
      job({ id: 'c', status: 'printed' }),
    ]);

    const { result } = renderHook(() => usePrintQueue());

    await waitFor(() => expect(result.current.pending.map(j => j.id)).toEqual(['a']));
    expect(result.current.failed.map(j => j.id)).toEqual(['b']);
    expect(result.current.printed.map(j => j.id)).toEqual(['c']);
  });

  it('asks again when the main process announces that the queue changed', async () => {
    const { result } = renderHook(() => usePrintQueue());
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalledTimes(1));

    vi.mocked(window.electron.queueState).mockResolvedValue([job({ id: 'x', status: 'failed' })]);
    const onChanged = vi.mocked(window.electron.onQueueChanged).mock.calls[0][0];

    await act(async () => {
      onChanged();
    });

    await waitFor(() => expect(result.current.failed.map(j => j.id)).toEqual(['x']));

    vi.mocked(window.electron.queueState).mockResolvedValue([]);

    await act(async () => {
      onChanged();
    });

    await waitFor(() => expect(result.current.failed).toEqual([]));
  });

  it('does not read the queue on a timer: only the mount and the announcement do', async () => {
    vi.useFakeTimers();

    try {
      renderHook(() => usePrintQueue());
      await vi.advanceTimersByTimeAsync(60000);

      expect(window.electron.queueState).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an answer that arrives late does not undo a newer one', async () => {
    let releaseFirst: (state: PrintJobSummary[]) => void = () => undefined;

    vi.mocked(window.electron.queueState)
      .mockImplementationOnce(() => new Promise(resolve => (releaseFirst = resolve)))
      .mockResolvedValue([job({ id: 'new', status: 'failed' })]);

    const { result } = renderHook(() => usePrintQueue());
    const onChanged = vi.mocked(window.electron.onQueueChanged).mock.calls[0][0];

    await act(async () => {
      onChanged();
    });
    await waitFor(() => expect(result.current.failed.map(j => j.id)).toEqual(['new']));

    await act(async () => {
      releaseFirst([job({ id: 'old', status: 'failed' })]);
    });

    expect(result.current.failed.map(j => j.id)).toEqual(['new']);
  });

  it('retry calls the channel with the id, or with none for all, and refreshes', async () => {
    const { result } = renderHook(() => usePrintQueue());
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.retry('j-9');
    });
    expect(window.electron.retryFailed).toHaveBeenLastCalledWith('j-9');

    await act(async () => {
      await result.current.retry();
    });
    expect(window.electron.retryFailed).toHaveBeenLastCalledWith(undefined);
    expect(window.electron.queueState).toHaveBeenCalledTimes(3);
  });

  it('discard calls the channel with the id and reads the queue even if the main announced nothing', async () => {
    const { result } = renderHook(() => usePrintQueue());
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalledTimes(1));

    let discarded = false;
    await act(async () => {
      discarded = await result.current.discard('j-9');
    });

    expect(window.electron.discardJob).toHaveBeenCalledWith('j-9');
    expect(discarded).toBe(true);
    expect(window.electron.queueState).toHaveBeenCalledTimes(2);
  });

  it('discard that the main refuses resolves to false, and a rejected channel is logged, not thrown', async () => {
    const { result } = renderHook(() => usePrintQueue());
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalledTimes(1));

    vi.mocked(window.electron.discardJob).mockResolvedValueOnce(false);
    await act(async () => {
      expect(await result.current.discard('j-1')).toBe(false);
    });

    vi.mocked(window.electron.discardJob).mockRejectedValueOnce(new Error('no handler'));
    await act(async () => {
      expect(await result.current.discard('j-1')).toBe(false);
    });
    expect(window.electron.queueState).toHaveBeenCalledTimes(3);
  });

  it('removes the listener on unmount', async () => {
    const offChanged = vi.fn();
    vi.mocked(window.electron.onQueueChanged).mockReturnValue(offChanged);

    const { unmount } = renderHook(() => usePrintQueue());
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalled());

    unmount();

    expect(offChanged).toHaveBeenCalledTimes(1);
  });

  it('is not loaded until the main process answers, and an empty answer is loaded', async () => {
    let answer: (jobs: PrintJobSummary[]) => void = () => undefined;
    vi.mocked(window.electron.queueState).mockReturnValue(new Promise(resolve => (answer = resolve)));
    const { result } = renderHook(() => usePrintQueue());

    expect(result.current.loaded).toBe(false);

    await act(async () => answer([]));

    expect(result.current.loaded).toBe(true);
  });

  it('reprint sends the id to the main process, reads the queue again and returns what it answered', async () => {
    vi.mocked(window.electron.reprintJob).mockReset().mockResolvedValue(true);
    const { result } = renderHook(() => usePrintQueue());
    await waitFor(() => expect(window.electron.queueState).toHaveBeenCalledTimes(1));

    let accepted = false;
    await act(async () => {
      accepted = await result.current.reprint('j-9');
    });

    expect(accepted).toBe(true);
    expect(window.electron.reprintJob).toHaveBeenCalledWith('j-9');
    expect(window.electron.queueState).toHaveBeenCalledTimes(2);
  });

  it('reprint resolves to false, without throwing, when the channel rejects', async () => {
    vi.mocked(window.electron.reprintJob).mockReset().mockRejectedValue(new Error('no handler'));
    const { result } = renderHook(() => usePrintQueue());

    let accepted = true;
    await act(async () => {
      accepted = await result.current.reprint('j-9');
    });

    expect(accepted).toBe(false);
  });
});
