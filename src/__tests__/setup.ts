import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// The renderer talks to the main process through the preload bridge, which does
// not exist under jsdom.
Object.defineProperty(window, 'electron', {
  writable: true,
  value: {
    arch: 'x64',
    rawPrint: vi.fn().mockResolvedValue(undefined),
    onBeforeQuit: vi.fn().mockReturnValue(() => undefined),
    beforeQuitDone: vi.fn(),
    notification: vi.fn().mockResolvedValue(undefined),
  },
});
