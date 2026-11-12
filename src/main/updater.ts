import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import { describeError } from 'shared/describeError';
import { UPDATE_CHECK_INTERVAL_MS } from 'shared/appUpdate';
import type { UpdateState, UpdateStatus } from 'shared/appUpdate';
import { releaseNotesToLines } from 'shared/releaseNotes';
import { logger } from './logger';
import { readAutoDownloadUpdates, writeAutoDownloadUpdates } from './uiPreferences';

type Listener = (state: UpdateState) => void;

// A check in the middle of a download is a request to confuse the electron-updater.
const BUSY: ReadonlySet<UpdateStatus> = new Set<UpdateStatus>(['downloading', 'ready', 'restarting']);

// Diagnostic for the log, never the card text: the screen's wording lives in the state table of the view.
function diagnostic(err: unknown): string {
  const { name, message } = describeError(err);

  return message ? `${name}: ${message}` : name;
}

export class AppUpdater {
  private current: UpdateState;
  private readonly listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private started = false;

  constructor() {
    this.current = {
      status: 'idle',
      currentVersion: app.getVersion(),
      targetVersion: null,
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
      lastCheckedAt: null,
      error: null,
      autoDownload: readAutoDownloadUpdates(),
      restartScheduled: false,
      pendingJobs: 0,
      releaseNotes: [],
    };
  }

  state(): UpdateState {
    return { ...this.current, releaseNotes: [...this.current.releaseNotes] };
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  check(): void {
    if (BUSY.has(this.current.status)) {
      return;
    }

    try {
      autoUpdater.checkForUpdates().catch((err: unknown) => this.fail('update check failed', err));
    } catch (err: unknown) {
      this.fail('update check failed', err);
    }
  }

  download(): void {
    if (this.current.targetVersion === null || BUSY.has(this.current.status)) {
      return;
    }

    this.set({ status: 'downloading', percent: 0, transferredBytes: 0, totalBytes: 0, error: null });

    try {
      autoUpdater.downloadUpdate().catch((err: unknown) => this.fail('update download failed', err));
    } catch (err: unknown) {
      this.fail('update download failed', err);
    }
  }

  setAutoDownload(value: boolean): void {
    try {
      writeAutoDownloadUpdates(value);
    } catch (err: unknown) {
      logger.error('update: could not save the auto download preference', describeError(err));
    }

    autoUpdater.autoDownload = value;
    this.set({ autoDownload: value });

    if (value && this.current.status === 'available') {
      this.download();
    }
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    autoUpdater.logger = logger;
    autoUpdater.autoDownload = this.current.autoDownload;
    // Always on, even with the automatic download off (RN-09): it is what makes "installed when the app
    // is closed" true for whatever was already downloaded, and the net for an operator who never clicks.
    autoUpdater.autoInstallOnAppQuit = true;

    this.events();
    this.check();

    this.timer = setInterval(() => this.check(), UPDATE_CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private events(): void {
    autoUpdater.on('checking-for-update', () => {
      this.set({ status: 'checking', error: null });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.set({
        status: this.current.autoDownload ? 'downloading' : 'available',
        targetVersion: info.version,
        releaseNotes: releaseNotesToLines(info.releaseNotes),
        lastCheckedAt: Date.now(),
        percent: 0,
        error: null,
      });
    });

    autoUpdater.on('update-not-available', () => {
      this.set({ status: 'idle', targetVersion: null, releaseNotes: [], lastCheckedAt: Date.now(), error: null });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.set({
        status: 'downloading',
        percent: progress.percent,
        transferredBytes: progress.transferred,
        totalBytes: progress.total,
        bytesPerSecond: progress.bytesPerSecond ?? 0,
        error: null,
      });
    });

    autoUpdater.on('update-downloaded', () => {
      this.set({ status: 'ready', percent: 100, bytesPerSecond: 0, error: null });
    });

    autoUpdater.on('error', (err: unknown) => {
      logger.error('update failed', describeError(err));
      this.set({ status: 'error', error: diagnostic(err), lastCheckedAt: Date.now() });
    });
  }

  // The 'error' event usually fires too, and it comes first; do not announce the same failure twice.
  private fail(message: string, err: unknown): void {
    logger.error(message, describeError(err));

    if (this.current.status === 'error') {
      return;
    }

    this.set({ status: 'error', error: diagnostic(err), lastCheckedAt: Date.now() });
  }

  private set(patch: Partial<UpdateState>): void {
    this.current = { ...this.current, ...patch };

    // A listener that throws must not undo the change nor reach whoever emitted the event.
    for (const listener of this.listeners) {
      try {
        listener(this.state());
      } catch (err: unknown) {
        logger.error('update: a listener failed', describeError(err));
      }
    }
  }
}

// A module-level instance, like the renderer's SocketStore singletons: the IPC handlers have no other way
// to reach the updater, and a reference threaded through boot() would have to be passed into every handler
// that ipcMain.handle registers at import time, before boot() runs. Lazy so that importing this module
// reads no preference file. The electron-updater's autoUpdater is itself a module singleton, so a second
// AppUpdater would subscribe every handler twice.
let instance: AppUpdater | null = null;

export function appUpdater(): AppUpdater {
  if (!instance) {
    instance = new AppUpdater();
  }

  return instance;
}
