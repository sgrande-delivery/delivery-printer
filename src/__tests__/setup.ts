import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import packageJson from '../../package.json';
import type { UpdateState } from 'shared/appUpdate';
import { SIDEBAR_DEFAULT_WIDTH, clampSidebarWidth } from 'shared/sidebarWidth';

// A coherent state, not {}: an empty object would let a screen pass under a state that the real channel
// never resolves to (same reasoning as the sidebar width below).
const idleUpdateState = (): UpdateState => ({
  status: 'idle',
  currentVersion: packageJson.version,
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
});

// The renderer talks to the main process through the preload bridge, which does
// not exist under jsdom.
Object.defineProperty(window, 'electron', {
  writable: true,
  value: {
    arch: 'x64',
    rawPrint: vi.fn().mockResolvedValue(undefined),
    listPrinters: vi.fn().mockResolvedValue([
      { name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: true },
      { name: 'Cozinha', displayName: 'Cozinha', isDefault: false },
    ]),
    enqueue: vi.fn().mockResolvedValue('enqueued'),
    printTest: vi.fn().mockResolvedValue('enqueued'),
    queueState: vi.fn().mockResolvedValue([]),
    retryFailed: vi.fn().mockResolvedValue(0),
    discardJob: vi.fn().mockResolvedValue(true),
    reprintJob: vi.fn().mockResolvedValue(true),
    notifyConnection: vi.fn(),
    onJobPrinted: vi.fn().mockReturnValue(() => undefined),
    onJobFailed: vi.fn().mockReturnValue(() => undefined),
    onQueueChanged: vi.fn().mockReturnValue(() => undefined),
    onBeforeQuit: vi.fn().mockReturnValue(() => undefined),
    beforeQuitDone: vi.fn(),
    log: vi.fn(),
    notification: vi.fn().mockResolvedValue(undefined),
    revealLogs: vi.fn().mockResolvedValue(true),
    initialTheme: null,
    uiTheme: vi.fn().mockResolvedValue({ preference: 'system', resolved: 'light' }),
    setUiTheme: vi.fn().mockResolvedValue('light'),
    // Clamped like the main process: a stub that echoed the width would let a drag to 900 look
    // accepted, which is a value the real channel never resolves to.
    uiSidebarWidth: vi.fn().mockResolvedValue(SIDEBAR_DEFAULT_WIDTH),
    setUiSidebarWidth: vi.fn().mockImplementation((width: number) => Promise.resolve(clampSidebarWidth(width))),
    onUiThemeChanged: vi.fn().mockReturnValue(() => undefined),
    updateState: vi.fn().mockImplementation(() => Promise.resolve(idleUpdateState())),
    checkForUpdate: vi.fn().mockImplementation(() => Promise.resolve(idleUpdateState())),
    downloadUpdate: vi.fn().mockImplementation(() => Promise.resolve(idleUpdateState())),
    setAutoDownloadUpdates: vi
      .fn()
      .mockImplementation((value: boolean) => Promise.resolve({ ...idleUpdateState(), autoDownload: value })),
    onUpdateChanged: vi.fn().mockReturnValue(() => undefined),
  },
});
