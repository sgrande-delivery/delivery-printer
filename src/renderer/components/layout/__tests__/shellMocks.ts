import { vi } from 'vitest';

/** State the layout suites share: what the mocked providers and hooks answer. Not collected as a suite. */
export const shell = {
  auth: {
    restaurant: { uuid: 'r-1', is_open: true } as { uuid: string; is_open: boolean } | null,
    user: { id: 1, name: 'maria', email: 'maria@example.com', image: null } as Record<string, unknown>,
    logout: vi.fn(),
  },
  queue: { pending: [] as unknown[], failed: [] as unknown[], retry: vi.fn() },
  printers: { printers: [] as { resolvedDevice: string | null }[], devicesRead: true, refresh: vi.fn() },
  connected: true,
  handleOpen: vi.fn(),
  theme: 'light' as 'light' | 'dark',
};
