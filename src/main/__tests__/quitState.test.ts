import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('quitState', () => {
  let mod: typeof import('../quitState');

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../quitState');
  });

  it('starts as not quitting', () => {
    expect(mod.isQuiting()).toBe(false);
  });

  it('markQuiting turns it on, and marking again changes nothing', () => {
    mod.markQuiting();
    mod.markQuiting();

    expect(mod.isQuiting()).toBe(true);
  });
});
