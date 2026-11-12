import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    },
    preference: true,
    savePreference: vi.fn(),
  };
});

vi.mock('electron', () => ({ app: { getVersion: () => '3.0.2' } }));
vi.mock('electron-updater', () => ({ autoUpdater: fake.autoUpdater }));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../uiPreferences', () => ({
  readAutoDownloadUpdates: () => fake.preference,
  writeAutoDownloadUpdates: fake.savePreference,
}));

import { AppUpdater } from '../updater';

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

  it('never produces restarting nor a scheduled restart', () => {
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
});
