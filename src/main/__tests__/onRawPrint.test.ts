import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mocks = vi.hoisted(() => ({
  printOptions: null as Record<string, unknown> | null,
  printResult: { success: true, reason: '' },
  printers: [] as { name: string }[],
  close: vi.fn(),
  loadedFile: '',
  fileAtLoad: '',
}));

// printFonts imports the logger, which pulls electron-log/main: replaced so it never
// loads against the electron stub below.
vi.mock('../logger', () => ({ logger: { warn: vi.fn() } }));

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '' },
  BrowserWindow: vi.fn(function () {
    return {
      webContents: {
        getPrintersAsync: async () => mocks.printers,
        loadFile: async (file: string) => {
          mocks.loadedFile = file;
          mocks.fileAtLoad = fs.readFileSync(file, 'utf8');
        },
        print: (options: Record<string, unknown>, callback: (success: boolean, reason: string) => void) => {
          mocks.printOptions = options;
          callback(mocks.printResult.success, mocks.printResult.reason);
        },
      },
      isDestroyed: () => false,
      close: mocks.close,
    };
  }),
}));

import { printReceipt } from '../ipc-events/onRawPrint';

const ID = 'onrawprint-test-job';
const FILE = path.join(os.tmpdir(), `${ID}.print.html`);

describe('printReceipt', () => {
  beforeEach(() => {
    mocks.printOptions = null;
    mocks.printResult = { success: true, reason: '' };
    mocks.printers = [{ name: 'EPSON TM-T20' }];
    mocks.close.mockClear();
    fs.rmSync(FILE, { force: true });
  });

  it('prints inside the printable area the driver declares (#89)', async () => {
    await printReceipt({ content: '<html></html>', copies: 1, deviceName: null, id: ID });

    expect(mocks.printOptions?.margins).toEqual({ marginType: 'printableArea' });
  });

  it('keeps the rest of the options: silent, mono, uncollated, the payload copies', async () => {
    await printReceipt({ content: '<html></html>', copies: 3, deviceName: null, id: ID });

    expect(mocks.printOptions).toMatchObject({ silent: true, color: false, collate: false, copies: 3 });
  });

  it('matches the Windows printer ignoring case', async () => {
    await printReceipt({ content: '<html></html>', copies: 1, deviceName: 'epson tm-t20', id: ID });

    expect(mocks.printOptions?.deviceName).toBe('EPSON TM-T20');
  });

  it.each([null, 'Unknown printer'])('falls back to the system default printer for %s', async deviceName => {
    await printReceipt({ content: '<html></html>', copies: 1, deviceName, id: ID });

    expect(mocks.printOptions).toHaveProperty('deviceName', undefined);
  });

  it('writes <id>.print.html in tmpdir with the font faces injected, and removes it on success', async () => {
    await printReceipt({ content: '<!DOCTYPE html><html><body>x</body></html>', copies: 1, deviceName: null, id: ID });

    expect(mocks.loadedFile).toBe(FILE);
    expect(mocks.fileAtLoad).toContain('@font-face');
    expect(mocks.fileAtLoad).toContain('<body>x</body>');
    expect(fs.existsSync(FILE)).toBe(false);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('rejects with the Electron reason, keeps the file and still closes the window', async () => {
    mocks.printResult = { success: false, reason: 'Print job canceled' };

    await expect(printReceipt({ content: '<html></html>', copies: 1, deviceName: null, id: ID })).rejects.toBe(
      'Print job canceled'
    );

    expect(fs.existsSync(FILE)).toBe(true);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    fs.rmSync(FILE, { force: true });
  });
});
