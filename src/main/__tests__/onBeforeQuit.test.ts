import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, Event } from 'electron';

const electron = vi.hoisted(() => ({
  quit: vi.fn(),
  handlers: new Map<string, () => void>(),
}));

vi.mock('electron', () => ({
  app: { quit: electron.quit },
  ipcMain: {
    once: (channel: string, handler: () => void) => electron.handlers.set(channel, handler),
    removeListener: (channel: string) => electron.handlers.delete(channel),
  },
}));

type Module = typeof import('../app-events/onBeforeQuit');

function makeWindow(destroyed = false) {
  return { isDestroyed: () => destroyed, webContents: { send: vi.fn() } };
}

describe('onBeforeQuit', () => {
  let mod: Module;
  let event: { preventDefault: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    electron.quit.mockClear();
    electron.handlers.clear();
    event = { preventDefault: vi.fn() };
    mod = await import('../app-events/onBeforeQuit');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns the renderer, holds the quit, and quits only after the ack', () => {
    const window = makeWindow();

    mod.onBeforeQuit(event as unknown as Event, window as unknown as BrowserWindow);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledWith(mod.BEFORE_QUIT_CHANNEL);
    expect(electron.quit).not.toHaveBeenCalled();

    electron.handlers.get(mod.BEFORE_QUIT_DONE_CHANNEL)?.();

    expect(electron.quit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(mod.QUIT_TIMEOUT_MS * 2);
    expect(electron.quit).toHaveBeenCalledTimes(1);
  });

  it('quits after the timeout when the renderer never answers', () => {
    mod.onBeforeQuit(event as unknown as Event, makeWindow() as unknown as BrowserWindow);

    vi.advanceTimersByTime(mod.QUIT_TIMEOUT_MS - 1);
    expect(electron.quit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(electron.quit).toHaveBeenCalledTimes(1);
  });

  it('does not throw with a destroyed window and still quits by timeout', () => {
    const window = makeWindow(true);

    expect(() => mod.onBeforeQuit(event as unknown as Event, window as unknown as BrowserWindow)).not.toThrow();
    expect(window.webContents.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(mod.QUIT_TIMEOUT_MS);
    expect(electron.quit).toHaveBeenCalledTimes(1);
  });

  it('lets the second before-quit (from our own quit) through', () => {
    mod.onBeforeQuit(event as unknown as Event, makeWindow() as unknown as BrowserWindow);
    vi.advanceTimersByTime(mod.QUIT_TIMEOUT_MS);

    const second = { preventDefault: vi.fn() };
    mod.onBeforeQuit(second as unknown as Event, makeWindow() as unknown as BrowserWindow);

    expect(second.preventDefault).not.toHaveBeenCalled();
  });
});
