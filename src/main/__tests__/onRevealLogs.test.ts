import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
  filePath: '',
  info: vi.fn(),
}));

vi.mock('electron', () => ({ shell: { showItemInFolder: mocks.showItemInFolder } }));

// Mirrors the real library's side effects, which the first version of this mock
// hid: getFile() creates the file empty, and info() writes a line into it.
vi.mock('../logger', () => ({
  logger: {
    info: (message: string) => {
      mocks.info(message);
      fs.appendFileSync(mocks.filePath, `${message}\n`);
    },
    transports: {
      file: {
        getFile: () => {
          fs.writeFileSync(mocks.filePath, '', { flag: 'a' });
          return { path: mocks.filePath };
        },
      },
    },
  },
}));

type Module = typeof import('../ipc-events/onRevealLogs');

describe('onRevealLogs', () => {
  let mod: Module;

  // The "logged once" flag is module state, so each test gets a fresh module:
  // a test that cannot start with the flag unset cannot tell "logs on the first
  // call" from "never logs".
  beforeEach(async () => {
    vi.resetModules();
    mocks.showItemInFolder.mockClear();
    mocks.info.mockClear();
    mocks.filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reveal-')), 'main.log');
    mod = await import('../ipc-events/onRevealLogs');
  });

  it('reveals the file and returns true when it has content', () => {
    fs.writeFileSync(mocks.filePath, 'x');

    expect(mod.onRevealLogs()).toBe(true);
    expect(mocks.showItemInFolder).toHaveBeenCalledWith(mocks.filePath);
  });

  it('does not reveal anything and returns false when the file is empty (fresh install)', () => {
    expect(mod.onRevealLogs()).toBe(false);
    expect(fs.existsSync(mocks.filePath)).toBe(true);
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
  });

  it('logs the resolved path on the first call only, before deciding', () => {
    mod.onRevealLogs();
    mod.onRevealLogs();

    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining(mocks.filePath));
  });
});
