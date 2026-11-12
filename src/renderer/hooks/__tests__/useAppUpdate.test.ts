import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from 'shared/appUpdate';
import { useAppUpdate } from '../useAppUpdate';

// `freshIdentity` makes useMessaging answer with a brand new handleOpen on every call, which is what the
// real provider and the shell suites do. Only the last describe turns it on; the calls land on the same spy
// either way, so every other test reads mocks.handleOpen as before.
const mocks = vi.hoisted(() => ({ handleOpen: vi.fn(), freshIdentity: false }));

vi.mock('renderer/providers/messaging', () => ({
  useMessaging: () => ({
    handleOpen: mocks.freshIdentity ? (message: string) => mocks.handleOpen(message) : mocks.handleOpen,
  }),
}));
vi.mock('renderer/services/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function state(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: 'idle',
    currentVersion: '3.0.2',
    targetVersion: null,
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    lastCheckedAt: null,
    error: null,
    autoDownload: true,
    restartScheduled: false,
    pendingJobs: 0,
    releaseNotes: [],
    ...overrides,
  };
}

describe('useAppUpdate', () => {
  beforeEach(() => {
    mocks.handleOpen.mockReset();
    vi.mocked(window.electron.updateState).mockReset().mockResolvedValue(state());
    vi.mocked(window.electron.checkForUpdate)
      .mockReset()
      .mockResolvedValue(state({ status: 'checking' }));
    vi.mocked(window.electron.downloadUpdate)
      .mockReset()
      .mockResolvedValue(state({ status: 'downloading' }));
    vi.mocked(window.electron.setAutoDownloadUpdates)
      .mockReset()
      .mockResolvedValue(state({ autoDownload: false }));
    vi.mocked(window.electron.restartToUpdate)
      .mockReset()
      .mockResolvedValue(state({ status: 'restarting' }));
    vi.mocked(window.electron.cancelRestart)
      .mockReset()
      .mockResolvedValue(state({ status: 'ready', restartScheduled: false }));
    vi.mocked(window.electron.onUpdateChanged)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  it('reads the state once and then follows the payload of the event', async () => {
    const { result } = renderHook(() => useAppUpdate());

    expect(result.current.state).toBeNull();
    await waitFor(() => expect(result.current.state?.status).toBe('idle'));

    const listener = vi.mocked(window.electron.onUpdateChanged).mock.calls[0][0];

    act(() => listener(state({ status: 'downloading', percent: 40 })));

    expect(result.current.state).toMatchObject({ status: 'downloading', percent: 40 });
    expect(window.electron.updateState).toHaveBeenCalledTimes(1);
  });

  it('does not let a late first read undo an event that already arrived', async () => {
    let resolveRead: (value: UpdateState) => void = () => undefined;
    vi.mocked(window.electron.updateState).mockReturnValue(new Promise(resolve => (resolveRead = resolve)));

    const { result } = renderHook(() => useAppUpdate());
    const listener = vi.mocked(window.electron.onUpdateChanged).mock.calls[0][0];

    act(() => listener(state({ status: 'ready' })));
    await act(async () => resolveRead(state({ status: 'idle' })));

    expect(result.current.state?.status).toBe('ready');
  });

  it('removes the listener on cleanup: mount, unmount, remount, one event, one call', async () => {
    const removers: Array<ReturnType<typeof vi.fn>> = [];
    const listeners = new Set<(s: UpdateState) => void>();

    vi.mocked(window.electron.onUpdateChanged).mockImplementation(listener => {
      listeners.add(listener);
      const remove = vi.fn(() => listeners.delete(listener));
      removers.push(remove);

      return remove;
    });

    const first = renderHook(() => useAppUpdate());
    first.unmount();
    const second = renderHook(() => useAppUpdate());

    expect(removers[0]).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(1);

    await waitFor(() => expect(second.result.current.state).not.toBeNull());

    const spy = vi.fn();
    const originalSet = [...listeners][0];
    listeners.clear();
    listeners.add(s => {
      spy();
      originalSet(s);
    });

    act(() => listeners.forEach(l => l(state({ status: 'ready' }))));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second.result.current.state?.status).toBe('ready');
  });

  it('check, download and setAutoDownload call the channel and adopt the resolved state', async () => {
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(() => result.current.check());
    expect(window.electron.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.state?.status).toBe('checking');

    await act(() => result.current.download());
    expect(window.electron.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.state?.status).toBe('downloading');

    await act(() => result.current.setAutoDownload(false));
    expect(window.electron.setAutoDownloadUpdates).toHaveBeenCalledWith(false);
    expect(result.current.state?.autoDownload).toBe(false);
  });

  // Each action is one line, and a swapped channel would be silent: restart is the most dangerous thing
  // the operator can ask for, and cancelRestart is the only way back out of it.
  it('restart and cancelRestart call their own channel and adopt the resolved state', async () => {
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(() => result.current.restart());
    expect(window.electron.restartToUpdate).toHaveBeenCalledTimes(1);
    expect(window.electron.cancelRestart).not.toHaveBeenCalled();
    expect(result.current.state?.status).toBe('restarting');

    await act(() => result.current.cancelRestart());
    expect(window.electron.cancelRestart).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ status: 'ready', restartScheduled: false });
  });

  it('a restart the main process refuses keeps the state and warns the operator', async () => {
    vi.mocked(window.electron.restartToUpdate).mockRejectedValue(new Error('boom'));
    vi.mocked(window.electron.cancelRestart).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const before = result.current.state;

    await act(() => result.current.restart());
    await act(() => result.current.cancelRestart());

    expect(result.current.state).toBe(before);
    expect(mocks.handleOpen).toHaveBeenCalledTimes(2);
  });

  it('a rejecting channel keeps the previous state and warns the operator', async () => {
    vi.mocked(window.electron.checkForUpdate).mockRejectedValue(new Error('boom'));
    vi.mocked(window.electron.downloadUpdate).mockRejectedValue(new Error('boom'));
    vi.mocked(window.electron.setAutoDownloadUpdates).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    const before = result.current.state;

    await act(() => result.current.check());
    await act(() => result.current.download());
    await act(() => result.current.setAutoDownload(false));

    expect(result.current.state).toBe(before);
    expect(mocks.handleOpen).toHaveBeenCalledTimes(3);
  });
});

describe('useAppUpdate: the notices only the operator asks for', () => {
  const NO_NEWS = 'Você já está na versão mais recente.';

  beforeEach(() => {
    mocks.handleOpen.mockReset();
    vi.mocked(window.electron.updateState)
      .mockReset()
      .mockResolvedValue(state({ lastCheckedAt: 1000 }));
    vi.mocked(window.electron.checkForUpdate)
      .mockReset()
      .mockResolvedValue(state({ status: 'checking', lastCheckedAt: 1000 }));
    vi.mocked(window.electron.cancelRestart).mockReset();
    vi.mocked(window.electron.onUpdateChanged)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  async function mounted() {
    const hook = renderHook(() => useAppUpdate());
    await waitFor(() => expect(hook.result.current.state).not.toBeNull());

    return { ...hook, emit: vi.mocked(window.electron.onUpdateChanged).mock.calls[0][0] };
  }

  it('says there is no news when a check the operator asked for ends idle with a newer lastCheckedAt', async () => {
    const { result, emit } = await mounted();

    await act(() => result.current.check());
    expect(mocks.handleOpen).not.toHaveBeenCalled();

    act(() => emit(state({ status: 'idle', lastCheckedAt: 2000 })));

    expect(mocks.handleOpen).toHaveBeenCalledTimes(1);
    expect(mocks.handleOpen).toHaveBeenCalledWith(NO_NEWS);
  });

  it('says nothing for a check nobody asked for: the boot and the 6 h cycle only emit events', async () => {
    const { emit } = await mounted();

    act(() => emit(state({ status: 'checking', lastCheckedAt: 1000 })));
    act(() => emit(state({ status: 'idle', lastCheckedAt: 2000 })));
    act(() => emit(state({ status: 'checking', lastCheckedAt: 2000 })));
    act(() => emit(state({ status: 'idle', lastCheckedAt: 3000 })));

    expect(mocks.handleOpen).not.toHaveBeenCalled();
  });

  it('says it once: the next idle after the answer is not a second notice', async () => {
    const { result, emit } = await mounted();

    await act(() => result.current.check());
    act(() => emit(state({ status: 'idle', lastCheckedAt: 2000 })));
    act(() => emit(state({ status: 'idle', lastCheckedAt: 3000 })));

    expect(mocks.handleOpen).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['news', state({ status: 'available', targetVersion: '3.1.0', lastCheckedAt: 2000 })],
    ['a failure', state({ status: 'error', lastCheckedAt: 1000 })],
  ])('says nothing when the check the operator asked for ends in %s, and forgets the request', async (_n, ended) => {
    const { result, emit } = await mounted();

    await act(() => result.current.check());
    act(() => emit(ended));
    act(() => emit(state({ status: 'idle', lastCheckedAt: 5000 })));

    expect(mocks.handleOpen).not.toHaveBeenCalled();
  });

  it('forgets the request when the click itself failed', async () => {
    vi.mocked(window.electron.checkForUpdate).mockRejectedValue(new Error('ipc'));
    const { result, emit } = await mounted();

    await act(() => result.current.check());
    mocks.handleOpen.mockClear();
    act(() => emit(state({ status: 'idle', lastCheckedAt: 2000 })));

    expect(mocks.handleOpen).not.toHaveBeenCalled();
  });

  it('says the restart was cancelled, with the text of the design, once the state is back to ready', async () => {
    vi.mocked(window.electron.cancelRestart).mockResolvedValue(
      state({ status: 'ready', targetVersion: '3.1.0', restartScheduled: false })
    );
    const { result } = await mounted();

    await act(() => result.current.cancelRestart());

    expect(mocks.handleOpen).toHaveBeenCalledWith('Reinício cancelado. A atualização será instalada ao fechar o app.');
  });

  it('does not claim a cancel that the main process ignored', async () => {
    vi.mocked(window.electron.cancelRestart).mockResolvedValue(state({ status: 'idle' }));
    const { result } = await mounted();

    await act(() => result.current.cancelRestart());

    expect(mocks.handleOpen).not.toHaveBeenCalled();
  });
});

/**
 * The guard of the ref in useAppUpdate.ts, and the only test that states it.
 *
 * The mechanism: the provider's handleOpen is a useCallback with [open] (providers/messaging.tsx:31), so it
 * changes identity every time a toast opens and every time one closes; and providers/__tests__/auth.test.tsx:22
 * mocks useMessaging answering with a brand new function on every call, with the real AppShell mounted.
 * With handleOpen back in the dependency array of the subscribing effect, every render tears the listener down
 * and subscribes again, reads the state again and adopts it -- a render that causes the next render, forever.
 *
 * Why it is worth a test of its own: in auth.test.tsx that loop does not fail, it kills the worker with
 * "FATAL ERROR: ... JavaScript heap out of memory" after minutes, naming neither this hook nor the cause.
 * Here it is one assertion, in under a second.
 */
describe('useAppUpdate: the subscription never follows the identity of handleOpen', () => {
  beforeEach(() => {
    mocks.freshIdentity = true;
    mocks.handleOpen.mockReset();
    vi.mocked(window.electron.updateState).mockReset().mockResolvedValue(state());
    vi.mocked(window.electron.onUpdateChanged)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  afterEach(() => {
    mocks.freshIdentity = false;
  });

  it('subscribes once however many times the messaging value changes identity', async () => {
    const { rerender } = renderHook(() => useAppUpdate());

    for (let i = 0; i < 5; i += 1) {
      rerender();
    }
    await waitFor(() => expect(window.electron.updateState).toHaveBeenCalled());

    expect(vi.mocked(window.electron.onUpdateChanged).mock.calls).toHaveLength(1);
  });
});
