import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from 'shared/appUpdate';
import { useAppUpdate } from '../useAppUpdate';

const mocks = vi.hoisted(() => ({ handleOpen: vi.fn() }));

vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: mocks.handleOpen }) }));
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
