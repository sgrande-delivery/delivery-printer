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
  readAutoDownloadUpdates,
  readPreference,
  readSidebarWidth,
  resolve,
  setPreference,
  titleBarOverlayFor,
  writeAutoDownloadUpdates,
  writePreference,
  writeSidebarWidth,
} from '../uiPreferences';

import { SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from 'shared/sidebarWidth';

const FILE = 'ui-preferences.json';

describe('ui preferences file', () => {
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
    ['a non-object', '"dark"'],
  ])('falls back to system and warns on %s', (_name, content) => {
    fs.writeFileSync(path.join(electron.userData, FILE), content);

    expect(readPreference()).toBe('system');
    expect(log.warn).toHaveBeenCalled();
  });

  it.each([
    ['a width-only file', JSON.stringify({ sidebarWidth: 250 })],
    ['an empty object', JSON.stringify({})],
  ])('reads the system theme from %s without warning', (_name, content) => {
    fs.writeFileSync(path.join(electron.userData, FILE), content);

    expect(readPreference()).toBe('system');
    expect(log.warn).not.toHaveBeenCalled();
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

  // uiPreferences.ts keeps the last resolved value in module state, which persists across the
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

describe('sidebar width preference', () => {
  const file = (): string => path.join(electron.userData, FILE);
  const stored = (): unknown => JSON.parse(fs.readFileSync(file(), 'utf8'));

  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'width-'));
    log.warn.mockClear();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('RN-01: saving the width keeps the theme', () => {
    writePreference('dark');
    expect(writeSidebarWidth(280)).toBe(280);

    expect(readPreference()).toBe('dark');
    expect(readSidebarWidth()).toBe(280);
  });

  it('RN-01: saving the theme keeps the width', () => {
    writeSidebarWidth(280);
    writePreference('light');

    expect(readSidebarWidth()).toBe(280);
    expect(readPreference()).toBe('light');
  });

  it('keeps a key it does not know across a write', () => {
    fs.writeFileSync(file(), JSON.stringify({ theme: 'dark', futura: 1 }));

    writeSidebarWidth(250);
    expect(stored()).toEqual({ theme: 'dark', futura: 1, sidebarWidth: 250 });

    writePreference('light');
    expect(stored()).toEqual({ theme: 'light', futura: 1, sidebarWidth: 250 });
  });

  it('is the default when the file is absent, without a warning', () => {
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('is the default when the key is absent, without a warning', () => {
    fs.writeFileSync(file(), JSON.stringify({ theme: 'dark' }));

    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('is the default and warns on invalid JSON', () => {
    fs.writeFileSync(file(), '{not json');

    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(log.warn).toHaveBeenCalled();
  });

  it.each([
    ['below the range', 4, SIDEBAR_MIN_WIDTH],
    ['above the range', 99999, SIDEBAR_MAX_WIDTH],
  ])('clamps %s on read and does not rewrite the file', (_name, width, expected) => {
    const content = JSON.stringify({ theme: 'dark', sidebarWidth: width });
    fs.writeFileSync(file(), content);

    expect(readSidebarWidth()).toBe(expected);
    expect(log.warn).toHaveBeenCalled();
    expect(fs.readFileSync(file(), 'utf8')).toBe(content);
  });

  it.each([
    ['a numeric string', '280'],
    ['an empty string', ''],
    ['null', null],
    ['a boolean', true],
    ['an object', { a: 1 }],
  ])('treats %s as the default, not as the minimum', (_name, width) => {
    const content = JSON.stringify({ sidebarWidth: width });
    fs.writeFileSync(file(), content);

    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(fs.readFileSync(file(), 'utf8')).toBe(content);
  });

  it('resolves to the clamped width that was written', () => {
    expect(writeSidebarWidth(99999)).toBe(SIDEBAR_MAX_WIDTH);
    expect(readSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH);
    expect(writeSidebarWidth('x')).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  // A width the caller cannot have meant leaves a line in the log. Without it, NaN from drag
  // arithmetic saves the default, the sidebar snaps back, and nothing says why.
  it.each([[NaN], ['x'], [99999]])('warns when the width asked for is not the one saved: %j', width => {
    writeSidebarWidth(width);

    expect(log.warn).toHaveBeenCalled();
  });

  it('writes a width inside the range without warning', () => {
    expect(writeSidebarWidth(250)).toBe(250);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('replaces an unreadable file instead of failing the write', () => {
    fs.writeFileSync(file(), '{not json');

    expect(writeSidebarWidth(250)).toBe(250);
    expect(stored()).toEqual({ sidebarWidth: 250 });
  });
});

describe('auto download updates preference', () => {
  const file = (): string => path.join(electron.userData, FILE);

  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'autodl-'));
    log.warn.mockClear();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('defaults to true when the file or the key is absent, without a warning', () => {
    expect(readAutoDownloadUpdates()).toBe(true);

    fs.writeFileSync(file(), JSON.stringify({ theme: 'dark' }));
    expect(readAutoDownloadUpdates()).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('survives a round trip, false included', () => {
    writeAutoDownloadUpdates(false);
    expect(readAutoDownloadUpdates()).toBe(false);

    writeAutoDownloadUpdates(true);
    expect(readAutoDownloadUpdates()).toBe(true);
  });

  it('RN-10: survives a theme write and keeps the theme and the width', () => {
    fs.writeFileSync(file(), JSON.stringify({ theme: 'dark', sidebarWidth: 280 }));

    writeAutoDownloadUpdates(false);
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toEqual({
      theme: 'dark',
      sidebarWidth: 280,
      autoDownloadUpdates: false,
    });

    writePreference('light');
    expect(readAutoDownloadUpdates()).toBe(false);
    expect(readPreference()).toBe('light');
    expect(readSidebarWidth()).toBe(280);
  });

  it.each([
    ['a string', 'false'],
    ['a number', 0],
    ['null', null],
  ])('falls back to true and warns when the value is %s', (_name, value) => {
    fs.writeFileSync(file(), JSON.stringify({ autoDownloadUpdates: value }));

    expect(readAutoDownloadUpdates()).toBe(true);
    expect(log.warn).toHaveBeenCalled();
  });
});
