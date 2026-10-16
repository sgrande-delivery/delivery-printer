import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// The renderer talks to the main process through the preload bridge, which does
// not exist under jsdom.
Object.defineProperty(window, 'electron', {
  writable: true,
  value: {
    arch: 'x64',
    rawPrint: vi.fn().mockResolvedValue(undefined),
    enqueue: vi.fn().mockResolvedValue('enqueued'),
    queueState: vi.fn().mockResolvedValue([]),
    retryFailed: vi.fn().mockResolvedValue(0),
    notifyConnection: vi.fn(),
    onJobPrinted: vi.fn().mockReturnValue(() => undefined),
    onJobFailed: vi.fn().mockReturnValue(() => undefined),
    onQueueChanged: vi.fn().mockReturnValue(() => undefined),
    onBeforeQuit: vi.fn().mockReturnValue(() => undefined),
    beforeQuitDone: vi.fn(),
    log: vi.fn(),
    notification: vi.fn().mockResolvedValue(undefined),
    revealLogs: vi.fn().mockResolvedValue(true),
  },
});
