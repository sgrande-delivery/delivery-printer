import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electron = vi.hoisted(() => ({
  isPackaged: true,
  userData: '',
  openAtLogin: false,
  setLoginItemSettings: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return electron.isPackaged;
    },
    getPath: () => electron.userData,
    getLoginItemSettings: () => ({ openAtLogin: electron.openAtLogin }),
    setLoginItemSettings: electron.setLoginItemSettings,
  },
}));

import { registerAutostart, START_MINIMIZED_ARG } from '../autostart';

describe('registerAutostart', () => {
  beforeEach(() => {
    electron.isPackaged = true;
    electron.openAtLogin = false;
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'autostart-'));
    electron.setLoginItemSettings.mockClear();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('does nothing when the app is not packaged', () => {
    electron.isPackaged = false;

    registerAutostart();

    expect(electron.setLoginItemSettings).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(electron.userData, 'autostart.json'))).toBe(false);
  });

  it('enables on the first packaged run and writes the mark', () => {
    registerAutostart();

    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, args: [START_MINIMIZED_ARG] });
    expect(fs.existsSync(path.join(electron.userData, 'autostart.json'))).toBe(true);
  });

  it('does not touch the setting after the user turned it off', () => {
    registerAutostart();
    electron.setLoginItemSettings.mockClear();
    electron.openAtLogin = false;

    registerAutostart();

    expect(electron.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it('keeps an autostart that someone else already enabled, and writes the mark', () => {
    electron.openAtLogin = true;

    registerAutostart();

    expect(electron.setLoginItemSettings).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(electron.userData, 'autostart.json'))).toBe(true);
  });

  it('does not throw nor re-enable when the mark file is corrupted, and reports it', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fs.writeFileSync(path.join(electron.userData, 'autostart.json'), '{not json');

    expect(() => registerAutostart()).not.toThrow();
    expect(electron.setLoginItemSettings).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalled();

    reported.mockRestore();
  });
});
