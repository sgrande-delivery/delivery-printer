import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electron = vi.hoisted(() => ({
  userData: '',
  dark: false,
  updated: undefined as (() => void) | undefined,
}));

vi.mock('electron', () => ({
  app: { getPath: () => electron.userData },
  nativeTheme: {
    get shouldUseDarkColors() {
      return electron.dark;
    },
    on: (_event: string, listener: () => void) => {
      electron.updated = listener;
    },
  },
}));

const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock('../logger', () => ({ logger: log }));

import {
  onResolvedChange,
  readPreference,
  resolve,
  setPreference,
  titleBarOverlayFor,
  writePreference,
} from '../theme';

const FILE = 'ui-preferences.json';

describe('theme preference', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-'));
    electron.dark = false;
    log.warn.mockClear();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('falls back to system when the file is absent, without a warning', () => {
    expect(readPreference()).toBe('system');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['a value outside the three', JSON.stringify({ theme: 'sepia' })],
    ['a missing key', JSON.stringify({})],
    ['a non-object', '"dark"'],
  ])('falls back to system and warns on %s', (_name, content) => {
    fs.writeFileSync(path.join(electron.userData, FILE), content);

    expect(readPreference()).toBe('system');
    expect(log.warn).toHaveBeenCalled();
  });

  it('survives a round trip', () => {
    writePreference('dark');
    expect(readPreference()).toBe('dark');
    expect(JSON.parse(fs.readFileSync(path.join(electron.userData, FILE), 'utf8'))).toEqual({ theme: 'dark' });
  });

  it('resolve ignores the system when fixed and follows it otherwise', () => {
    electron.dark = true;
    expect(resolve('light')).toBe('light');
    expect(resolve('system')).toBe('dark');

    electron.dark = false;
    expect(resolve('dark')).toBe('dark');
    expect(resolve('system')).toBe('light');
  });

  it('uses a 56 px overlay in both themes with different colors', () => {
    expect(titleBarOverlayFor('light').height).toBe(56);
    expect(titleBarOverlayFor('dark').height).toBe(56);
    expect(titleBarOverlayFor('light').symbolColor).not.toBe(titleBarOverlayFor('dark').symbolColor);
  });

  // theme.ts keeps the last resolved value in module state, which persists across the
  // its of this file. This one starts from last === 'light' (the beforeEach gives a fresh
  // userData with dark=false), so keep it after the ones that do not touch
  // onResolvedChange: a new onResolvedChange test above it would break it with no clue.
  it('only calls back when the resolved theme changes', () => {
    const listener = vi.fn();
    const cancel = onResolvedChange(listener);

    electron.updated?.();
    expect(listener).not.toHaveBeenCalled();

    electron.dark = true;
    electron.updated?.();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith('dark');

    electron.updated?.();
    expect(listener).toHaveBeenCalledTimes(1);

    expect(setPreference('light')).toBe('light');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith('light');

    cancel();
    setPreference('dark');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
