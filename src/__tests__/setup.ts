import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
    onUiThemeChanged: vi.fn().mockReturnValue(() => undefined),
  },
});
