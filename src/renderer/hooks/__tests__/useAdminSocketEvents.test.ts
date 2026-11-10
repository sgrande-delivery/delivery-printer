import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminSocketEvents } from '../useAdminSocketEvents';

const mocks = vi.hoisted(() => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  state: { restaurant: null as null | { id: number; uuid: string } },
}));

vi.mock('renderer/providers/auth', () => ({
  useAuth: () => ({ restaurant: mocks.state.restaurant, setRestaurantIsOpen: vi.fn() }),
}));
vi.mock('../useAdminSocket', () => ({
  useAdminSocket: () => ({ socket: mocks.socket, isConnected: false }),
}));

describe('useAdminSocketEvents - before quit', () => {
  let fire: () => void;
  const remove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.restaurant = { id: 7, uuid: 'uuid-1' };
    vi.mocked(window.electron.onBeforeQuit).mockImplementation(listener => {
      fire = listener;
      return remove;
    });
  });

  function ack(message: 'OK' | 'IGNORED'): void {
    const callback = mocks.socket.emit.mock.calls.find(call => call[0] === 'printer_exited')?.[2];
    callback({ event: 'printer_exited', message });
  }

  it('emits printer_exited with the raw uuid and an ack callback', () => {
    renderHook(() => useAdminSocketEvents());

    fire();

    expect(mocks.socket.emit).toHaveBeenCalledWith('printer_exited', 'uuid-1', expect.any(Function));
  });

  it('only acks the main process when the server ack arrives', () => {
    renderHook(() => useAdminSocketEvents());

    fire();
    expect(window.electron.beforeQuitDone).not.toHaveBeenCalled();

    ack('OK');
    expect(window.electron.beforeQuitDone).toHaveBeenCalledTimes(1);
  });

  it('logs an IGNORED ack and still lets the app quit', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHook(() => useAdminSocketEvents());

    fire();
    ack('IGNORED');

    expect(error).toHaveBeenCalledTimes(1);
    expect(window.electron.beforeQuitDone).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('does not log an OK ack', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderHook(() => useAdminSocketEvents());

    fire();
    ack('OK');

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('removes the channel listener on unmount', () => {
    const { unmount } = renderHook(() => useAdminSocketEvents());

    unmount();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not listen nor emit without a restaurant', () => {
    mocks.state.restaurant = null;

    renderHook(() => useAdminSocketEvents());

    expect(window.electron.onBeforeQuit).not.toHaveBeenCalled();
    expect(mocks.socket.emit).not.toHaveBeenCalledWith('printer_exited', expect.anything(), expect.anything());
  });
});
