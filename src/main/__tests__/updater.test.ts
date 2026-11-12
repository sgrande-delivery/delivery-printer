import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { UPDATE_CHECK_INTERVAL_MS } from 'shared/appUpdate';

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();

  return {
    handlers,
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
    // Every call that matters for ordering, in the order it happened.
    calls: [] as string[],
    markQuiting: vi.fn(),
    preference: true,
    savePreference: vi.fn(),
  };
});

vi.mock('electron', () => ({ app: { getVersion: () => '3.0.2' } }));
vi.mock('electron-updater', () => ({ autoUpdater: fake.autoUpdater }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../quitState', () => ({ markQuiting: fake.markQuiting }));
vi.mock('../uiPreferences', () => ({
  readAutoDownloadUpdates: () => fake.preference,
  writeAutoDownloadUpdates: fake.savePreference,
}));

import { AppUpdater } from '../updater';
import type { QueueLink } from '../updater';
import { logger } from '../logger';

function emit(event: string, ...args: unknown[]): void {
  fake.handlers.get(event)?.(...args);
}

const NOW = new Date('2026-11-12T10:00:00Z').getTime();

describe('AppUpdater', () => {
  let updater: AppUpdater;

  function boot(autoDownload = true): AppUpdater {
    fake.preference = autoDownload;
    updater = new AppUpdater();
    updater.start();
    fake.autoUpdater.checkForUpdates.mockClear();

    return updater;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fake.handlers.clear();
    // The preference is module state of the mock: without this line a test that does not call boot()
    // inherits whatever the previous one left behind.
    fake.preference = true;
    fake.autoUpdater.autoDownload = true;
    fake.autoUpdater.autoInstallOnAppQuit = false;
    fake.autoUpdater.on.mockClear();
    fake.autoUpdater.checkForUpdates.mockClear();
    fake.autoUpdater.downloadUpdate.mockClear();
    fake.savePreference.mockClear();
    fake.autoUpdater.quitAndInstall.mockReset();
    fake.markQuiting.mockReset();
    fake.calls.length = 0;
    fake.markQuiting.mockImplementation(() => fake.calls.push('markQuiting'));
    fake.autoUpdater.quitAndInstall.mockImplementation(() => fake.calls.push('quitAndInstall'));
  });

  afterEach(() => {
    updater?.stop();
    vi.useRealTimers();
  });

  const base = {
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
  };

  it('starts idle with the installed version', () => {
    updater = new AppUpdater();

    expect(updater.state()).toEqual({ ...base, status: 'idle' });
  });

  it('checking-for-update -> checking', () => {
    boot();
    emit('checking-for-update');

    expect(updater.state()).toEqual({ ...base, status: 'checking' });
  });

  it('update-available -> downloading with the version, the notes as text and the check time', () => {
    boot();
    emit('update-available', { version: '3.1.0', releaseNotes: '<ul><li>Um</li><li>Dois &amp; três</li></ul>' });

    expect(updater.state()).toEqual({
      ...base,
      status: 'downloading',
      targetVersion: '3.1.0',
      releaseNotes: ['Um', 'Dois & três'],
      lastCheckedAt: NOW,
    });
  });

  it('update-available with the auto download off stops at available and does not download', () => {
    boot(false);
    emit('update-available', { version: '3.1.0', releaseNotes: '' });

    expect(updater.state()).toEqual({
      ...base,
      autoDownload: false,
      status: 'available',
      targetVersion: '3.1.0',
      lastCheckedAt: NOW,
    });
    expect(fake.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('update-not-available -> idle, without a target, with the check time', () => {
    boot();
    emit('update-available', { version: '3.1.0', releaseNotes: '<p>x</p>' });
    emit('update-not-available', {});

    expect(updater.state()).toEqual({ ...base, status: 'idle', lastCheckedAt: NOW });
  });

  it('download-progress -> downloading with the numbers', () => {
    boot();
    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    emit('download-progress', { percent: 42.5, transferred: 1000, total: 2000, bytesPerSecond: 300 });

    expect(updater.state()).toEqual({
      ...base,
      status: 'downloading',
      targetVersion: '3.1.0',
      lastCheckedAt: NOW,
      percent: 42.5,
      transferredBytes: 1000,
      totalBytes: 2000,
      bytesPerSecond: 300,
    });
  });

  it('update-downloaded -> ready at 100%', () => {
    boot();
    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    emit('download-progress', { percent: 99, transferred: 1990, total: 2000, bytesPerSecond: 300 });
    emit('update-downloaded', {});

    expect(updater.state()).toMatchObject({ status: 'ready', percent: 100, targetVersion: '3.1.0', totalBytes: 2000 });
  });

  it('error -> error with the diagnostic, and the check time is updated (the check ended)', () => {
    boot();
    expect(updater.state().lastCheckedAt).toBeNull();

    vi.setSystemTime(NOW + 5000);
    emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));

    const state = updater.state();
    expect(state.status).toBe('error');
    expect(state.error).toContain('net::ERR_INTERNET_DISCONNECTED');
    expect(state.lastCheckedAt).toBe(NOW + 5000);
  });

  it('never restarts nor schedules a restart on its own', () => {
    boot();
    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    emit('update-downloaded', {});

    expect(updater.state()).toMatchObject({ restartScheduled: false, pendingJobs: 0 });
    expect(updater.state().status).not.toBe('restarting');
  });

  it('RN-09: autoInstallOnAppQuit is on whatever the preference, and autoDownload follows it', () => {
    boot(false);
    expect(fake.autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(fake.autoUpdater.autoDownload).toBe(false);

    updater.stop();
    boot(true);
    expect(fake.autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(fake.autoUpdater.autoDownload).toBe(true);
  });

  it('setAutoDownload(true) at available starts the download', () => {
    boot(false);
    emit('update-available', { version: '3.1.0', releaseNotes: '' });

    updater.setAutoDownload(true);

    expect(fake.savePreference).toHaveBeenCalledWith(true);
    expect(fake.autoUpdater.autoDownload).toBe(true);
    expect(fake.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(updater.state().status).toBe('downloading');
  });

  it('setAutoDownload(false) saves, applies and leaves autoInstallOnAppQuit alone', () => {
    boot(true);
    updater.setAutoDownload(false);

    expect(fake.savePreference).toHaveBeenCalledWith(false);
    expect(fake.autoUpdater.autoDownload).toBe(false);
    expect(fake.autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(updater.state().autoDownload).toBe(false);
    expect(fake.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('a preference that cannot be saved neither throws nor loses the choice for this session', () => {
    boot(false);
    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    fake.savePreference.mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    expect(() => updater.setAutoDownload(true)).not.toThrow();
    expect(updater.state().autoDownload).toBe(true);
    expect(fake.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('download() is a no-op without a target version', () => {
    boot(false);
    updater.download();

    expect(fake.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(updater.state().status).toBe('idle');
  });

  it('check() never rejects: a failing check becomes the error state', async () => {
    boot();
    fake.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('boom'));

    updater.check();
    await vi.advanceTimersByTimeAsync(0);

    expect(updater.state().status).toBe('error');
  });

  it('calls the listener once per change, with the whole state', () => {
    boot();
    const listener = vi.fn();
    const cancel = updater.onChange(listener);

    emit('checking-for-update');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'checking', currentVersion: '3.0.2' }));

    cancel();
    emit('update-not-available', {});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a listener that throws neither blocks the change nor the other listeners nor the emitter', () => {
    boot();
    const other = vi.fn();
    updater.onChange(() => {
      throw new Error('listener bug');
    });
    updater.onChange(other);

    expect(() => emit('checking-for-update')).not.toThrow();
    expect(updater.state().status).toBe('checking');
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('start() checks now and again every interval, except while downloading or ready', () => {
    updater = new AppUpdater();
    updater.start();
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    emit('update-available', { version: '3.1.0', releaseNotes: '' });
    expect(updater.state().status).toBe('downloading');
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    emit('update-downloaded', {});
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('start() twice subscribes once: autoUpdater is a module singleton', () => {
    updater = new AppUpdater();
    updater.start();
    const subscriptions = fake.autoUpdater.on.mock.calls.length;

    updater.start();

    expect(fake.autoUpdater.on.mock.calls.length).toBe(subscriptions);
    expect(fake.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('stop() prevents the next check', () => {
    boot();
    updater.stop();

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2);
    expect(fake.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });
  describe('restart', () => {
    let pending: number;
    let queueListeners: Set<() => void>;
    let unsubscribe: Mock<() => void>;
    let queue: QueueLink;

    // The queue the test controls: a count it sets and an announcement it fires.
    function announce(count: number): void {
      pending = count;
      for (const listener of [...queueListeners]) {
        listener();
      }
    }

    function ready(count: number): AppUpdater {
      pending = count;
      queueListeners = new Set();
      unsubscribe = vi.fn<() => void>();
      queue = {
        pendingCount: () => pending,
        onQueueChanged: listener => {
          queueListeners.add(listener);

          return () => {
            unsubscribe();
            queueListeners.delete(listener);
          };
        },
      };
      boot();
      updater.start(queue);
      emit('update-available', { version: '3.1.0', releaseNotes: '' });
      emit('update-downloaded', {});

      return updater;
    }

    it('with an empty queue marks the quit BEFORE quitAndInstall, silent and reopening (RN-05, RN-06)', () => {
      ready(0);
      updater.requestRestart();

      expect(fake.calls).toEqual(['markQuiting', 'quitAndInstall']);
      expect(fake.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true);
    });

    it('announces restarting BEFORE quitAndInstall, so the overlay is painted', () => {
      ready(0);
      updater.onChange(state => fake.calls.push(`announce:${state.status}`));
      updater.requestRestart();

      expect(fake.calls).toEqual(['announce:restarting', 'markQuiting', 'quitAndInstall']);
      expect(updater.state()).toMatchObject({ status: 'restarting', restartScheduled: false });
    });

    it('with two pending jobs schedules, announces and does not install', () => {
      ready(2);
      const listener = vi.fn();
      updater.onChange(listener);

      const state = updater.requestRestart();

      expect(state).toMatchObject({ status: 'ready', restartScheduled: true, pendingJobs: 2 });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ restartScheduled: true, pendingJobs: 2 }));
      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
      expect(fake.markQuiting).not.toHaveBeenCalled();
    });

    it('recounts on every queue announcement and installs once, at zero', () => {
      ready(2);
      updater.requestRestart();

      announce(1);
      expect(updater.state()).toMatchObject({ restartScheduled: true, pendingJobs: 1 });
      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

      announce(0);
      announce(0);

      expect(fake.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
      expect(fake.calls).toEqual(['markQuiting', 'quitAndInstall']);
      expect(updater.state().status).toBe('restarting');
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not announce the same count again', () => {
      ready(3);
      updater.requestRestart();
      const listener = vi.fn();
      updater.onChange(listener);

      announce(3);

      expect(listener).not.toHaveBeenCalled();
    });

    it('cancelRestart goes back to ready, unsubscribes, and a later empty queue installs nothing', () => {
      ready(2);
      updater.requestRestart();

      const state = updater.cancelRestart();

      expect(state).toMatchObject({ status: 'ready', restartScheduled: false, pendingJobs: 0 });
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(queueListeners.size).toBe(0);

      announce(0);

      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
      expect(fake.markQuiting).not.toHaveBeenCalled();
      expect(updater.state().status).toBe('ready');
    });

    it('cancelRestart with nothing scheduled is a no-op', () => {
      ready(0);
      const listener = vi.fn();
      updater.onChange(listener);

      expect(updater.cancelRestart().status).toBe('ready');
      expect(listener).not.toHaveBeenCalled();
    });

    it('a second request while scheduled does not subscribe twice', () => {
      ready(2);
      updater.requestRestart();
      updater.requestRestart();

      expect(queueListeners.size).toBe(1);
    });

    it.each(['idle', 'checking', 'available', 'downloading', 'error'] as const)(
      'requestRestart while %s is a no-op with a warning',
      status => {
        ready(0);
        // Reaches the status through the real events, not by writing the state.
        if (status === 'idle') {
          emit('update-not-available', {});
        } else if (status === 'checking') {
          emit('checking-for-update');
        } else if (status === 'available') {
          emit('update-available', { version: '3.2.0', releaseNotes: '' });
        } else if (status === 'downloading') {
          emit('download-progress', { percent: 10, transferred: 1, total: 10, bytesPerSecond: 1 });
        } else {
          emit('error', new Error('boom'));
        }
        const before = updater.state();
        vi.mocked(logger.warn).mockClear();

        const state = updater.requestRestart();

        expect(state).toEqual(before);
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
        expect(fake.markQuiting).not.toHaveBeenCalled();
        expect(queueListeners.size).toBe(0);
      }
    );

    it('requestRestart while restarting does not install twice', () => {
      ready(0);
      updater.requestRestart();
      updater.requestRestart();

      expect(fake.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    });

    // RN-07 lives in the link main.ts builds, and no test can import main.ts (nothing does): read it as
    // text, like the ipcChannels gate does. A list() without the filter would count printed and failed
    // jobs too, and a scheduled restart would then wait forever. That list('pending') leaves a failed job
    // out is proved by print-queue-store.test.ts.
    it('RN-07: the count main.ts injects asks the store for pending jobs only', () => {
      const source = readFileSync(resolve(__dirname, '../main.ts'), 'utf8');

      expect(source).toMatch(/pendingCount:[\s\S]{0,80}list\('pending'\)/);
    });

    // The queue hands its listeners a copy of the set, so a listener removed during an announcement still
    // runs in that round. Only the state guard keeps that stale call from installing after the operator
    // cancelled -- the unsubscribe alone would not.
    it('a listener still called after cancelRestart installs nothing', () => {
      ready(2);
      updater.requestRestart();
      const stale = [...queueListeners][0];

      updater.cancelRestart();
      pending = 0;
      stale();

      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
      expect(fake.markQuiting).not.toHaveBeenCalled();
    });

    it('a queue that cannot be counted waits instead of installing blind', () => {
      ready(0);
      queue.pendingCount = () => {
        throw new Error('disk');
      };
      updater.requestRestart();

      expect(updater.state()).toMatchObject({ restartScheduled: true, pendingJobs: 1 });
      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('refuses before the queue is linked', () => {
      boot();
      emit('update-available', { version: '3.1.0', releaseNotes: '' });
      emit('update-downloaded', {});

      expect(updater.requestRestart().status).toBe('ready');
      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('a quitAndInstall that throws becomes the error state, once', () => {
      ready(0);
      fake.autoUpdater.quitAndInstall.mockImplementation(() => {
        throw new Error('spawn failed');
      });

      updater.requestRestart();

      expect(updater.state().status).toBe('error');
    });

    it('an error while scheduled drops the wait: no stale schedule, and a later empty queue installs nothing', () => {
      ready(2);
      updater.requestRestart();

      emit('error', new Error('network'));

      expect(updater.state()).toMatchObject({ status: 'error', restartScheduled: false, pendingJobs: 0 });
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(queueListeners.size).toBe(0);

      announce(0);

      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
      expect(fake.markQuiting).not.toHaveBeenCalled();
    });

    it('a new cycle reaching ready after an error can be scheduled again', () => {
      ready(2);
      updater.requestRestart();
      emit('error', new Error('network'));
      emit('update-downloaded', {});

      expect(updater.state()).toMatchObject({ status: 'ready', restartScheduled: false });

      updater.requestRestart();

      expect(updater.state()).toMatchObject({ restartScheduled: true, pendingJobs: 2 });
    });

    it('ready -> ready with a recount keeps the schedule', () => {
      ready(3);
      updater.requestRestart();

      emit('update-downloaded', {});
      announce(1);

      expect(updater.state()).toMatchObject({ status: 'ready', restartScheduled: true, pendingJobs: 1 });
      expect(queueListeners.size).toBe(1);
    });

    it('stop() unsubscribes from the queue: a later announcement installs nothing', () => {
      ready(2);
      updater.requestRestart();

      updater.stop();
      announce(0);

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(fake.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });
  });
});
