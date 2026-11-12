import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();

  return {
    handlers,
    userData: '',
    autoUpdater: {
      logger: null as unknown,
      autoDownload: true,
      autoInstallOnAppQuit: false,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      }),
      checkForUpdates: vi.fn(() => Promise.resolve(null)),
      downloadUpdate: vi.fn(() => Promise.resolve([])),
      quitAndInstall: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  app: { getVersion: () => '3.0.2', getPath: () => fake.userData, isPackaged: false },
  nativeTheme: { shouldUseDarkColors: false },
  // The restart tests below do reach 'ready', and the real updater notifies there: without this stub the
  // construction throws and only the try/catch inside notifyReady() keeps those tests green.
  Notification: class {
    show = vi.fn();
    on = vi.fn();
  },
}));
vi.mock('../quitState', () => ({ markQuiting: vi.fn(), isQuiting: () => false }));
vi.mock('electron-updater', () => ({ autoUpdater: fake.autoUpdater }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

type Handlers = {
  onUpdateState: typeof import('../ipc-events/onUpdateState').onUpdateState;
  onCheckForUpdate: typeof import('../ipc-events/onCheckForUpdate').onCheckForUpdate;
  onDownloadUpdate: typeof import('../ipc-events/onDownloadUpdate').onDownloadUpdate;
  onSetAutoDownloadUpdates: typeof import('../ipc-events/onSetAutoDownloadUpdates').onSetAutoDownloadUpdates;
  onRestartToUpdate: typeof import('../ipc-events/onRestartToUpdate').onRestartToUpdate;
  onCancelRestart: typeof import('../ipc-events/onCancelRestart').onCancelRestart;
  appUpdater: typeof import('../updater').appUpdater;
};

function emit(event: string, ...args: unknown[]): void {
  fake.handlers.get(event)?.(...args);
}

// The real updater and the real preferences file; only the electron-updater is faked. Mocking the
// channel itself is what let bugs through in spec 15 (.claude/rules/printing.md).
describe('update IPC handlers', () => {
  let h: Handlers;
  let pending = 0;
  const queueListeners = new Set<() => void>();
  const queue = {
    pendingCount: () => pending,
    onQueueChanged: (listener: () => void) => {
      queueListeners.add(listener);

      return () => {
        queueListeners.delete(listener);
      };
    },
  };

  beforeEach(async () => {
    fake.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'update-ipc-'));
    fake.handlers.clear();
    pending = 0;
    queueListeners.clear();
    fake.autoUpdater.autoDownload = true;
    fake.autoUpdater.checkForUpdates.mockClear();
    fake.autoUpdater.downloadUpdate.mockClear();
    fake.autoUpdater.quitAndInstall.mockClear();
    vi.resetModules();

    h = {
      ...(await import('../ipc-events/onUpdateState')),
      ...(await import('../ipc-events/onCheckForUpdate')),
      ...(await import('../ipc-events/onDownloadUpdate')),
      ...(await import('../ipc-events/onSetAutoDownloadUpdates')),
      ...(await import('../ipc-events/onRestartToUpdate')),
      ...(await import('../ipc-events/onCancelRestart')),
      ...(await import('../updater')),
    };
    h.appUpdater().start({ queue });
    fake.autoUpdater.checkForUpdates.mockClear();
  });

  afterEach(() => {
    h.appUpdater().stop();
    fs.rmSync(fake.userData, { recursive: true, force: true });
  });

  it('hands every handler the same updater instance', () => {
    expect(h.appUpdater()).toBe(h.appUpdater());

    emit('update-available', { version: '3.1.0', releaseNotes: null });

    expect(h.onUpdateState().targetVersion).toBe('3.1.0');
  });

  it('resolves the idle state with the app version and the default preference', () => {
    expect(h.onUpdateState()).toMatchObject({
      status: 'idle',
      currentVersion: '3.0.2',
      autoDownload: true,
      releaseNotes: [],
    });
  });

  it('check asks the electron-updater and resolves the state after its synchronous change', () => {
    fake.autoUpdater.checkForUpdates.mockImplementationOnce(() => {
      emit('checking-for-update');

      return Promise.resolve(null);
    });

    expect(h.onCheckForUpdate().status).toBe('checking');
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('download resolves as downloading, and does nothing when no version was offered', () => {
    expect(h.onDownloadUpdate().status).toBe('idle');
    expect(fake.autoUpdater.downloadUpdate).not.toHaveBeenCalled();

    h.onSetAutoDownloadUpdates(null, false);
    emit('update-available', { version: '3.1.0', releaseNotes: null });

    expect(h.onUpdateState().status).toBe('available');
    expect(h.onDownloadUpdate().status).toBe('downloading');
    expect(fake.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('setAutoDownload persists, applies to the electron-updater and resolves the new state', () => {
    const state = h.onSetAutoDownloadUpdates(null, false);

    expect(state.autoDownload).toBe(false);
    expect(fake.autoUpdater.autoDownload).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(fake.userData, 'ui-preferences.json'), 'utf8'))).toMatchObject({
      autoDownloadUpdates: false,
    });
  });

  it.each([['true'], [1], [null], [undefined], [{}]])('refuses %s as the preference', value => {
    expect(() => h.onSetAutoDownloadUpdates(null, value)).toThrow(TypeError);
    expect(h.onUpdateState().autoDownload).toBe(true);
  });

  it('restart is a no-op until the update is ready', () => {
    expect(h.onRestartToUpdate().status).toBe('idle');
    expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('restart with an empty queue resolves restarting and installs', () => {
    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    emit('update-downloaded', {});

    expect(h.onRestartToUpdate().status).toBe('restarting');
    expect(fake.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('restart with pending work resolves scheduled, and cancel resolves ready again', () => {
    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    emit('update-downloaded', {});
    pending = 2;

    expect(h.onRestartToUpdate()).toMatchObject({ status: 'ready', restartScheduled: true, pendingJobs: 2 });
    expect(h.onCancelRestart()).toMatchObject({ status: 'ready', restartScheduled: false });

    pending = 0;
    queueListeners.forEach(listener => listener());

    expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
