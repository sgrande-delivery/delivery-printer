import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mocks = vi.hoisted(() => ({
  printOptions: null as Record<string, unknown> | null,
  printResult: { success: true, reason: '' },
  printers: [] as { name: string; isDefault?: boolean; options?: Record<string, string> }[],
  close: vi.fn(),
  loadedFile: '',
  fileAtLoad: '',
  // The useful width saved on this machine, by device name exactly as the store would match it.
  usefulWidths: {} as Record<string, number>,
  // What the operating system names as the default printer (defaultPrinter.ts); Electron 43 does not flag it.
  systemDefault: null as string | null,
  log: { info: vi.fn(), warn: vi.fn() },
}));

// The logger pulls electron-log/main: replaced so it never loads against the electron
// stub below (the print itself logs its geometry, and printFonts warns through it).
vi.mock('../logger', () => ({ logger: mocks.log }));

vi.mock('../defaultPrinter', () => ({ readDefaultPrinterName: async () => mocks.systemDefault }));

// The store is tested on a real file in printerPreferences.test.ts; here only what it answers matters, and the
// matching criterion is the real shared one.
vi.mock('../printerPreferences', async () => {
  const { findPrinterPreference } = await import('shared/printerGeometry');

  return {
    printerPreferenceFor: (deviceName: string | null | undefined) =>
      findPrinterPreference(
        Object.fromEntries(Object.entries(mocks.usefulWidths).map(([name, mm]) => [name, { usefulWidthMm: mm }])),
        deviceName
      ),
  };
});

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

// The shape of the delivery-api's print layout (resources/views/print/layout.blade.php), cut to what matters:
// the doctype, the @page rule, the padding div as the child of <body>.
const API_HTML =
  '<!DOCTYPE html>\n<html>\n<style>@page { size: 80mm auto; margin: 0; } * { box-sizing: border-box; }</style>\n' +
  '<body><div style="font-size: 14px; padding: 15px"><div class="doc">PEDIDO #0020</div></div></body>\n</html>';
const FILE = path.join(os.tmpdir(), `${ID}.print.html`);

describe('printReceipt', () => {
  beforeEach(() => {
    mocks.printOptions = null;
    mocks.printResult = { success: true, reason: '' };
    mocks.printers = [{ name: 'EPSON TM-T20' }];
    mocks.usefulWidths = {};
    mocks.systemDefault = null;
    mocks.close.mockClear();
    mocks.log.info.mockClear();
    mocks.log.warn.mockClear();
    fs.rmSync(FILE, { force: true });
  });

  it('prints inside the printable area the driver declares (#89), and with nothing saved forces nothing', async () => {
    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'EPSON TM-T20', id: ID });

    expect(mocks.printOptions?.margins).toEqual({ marginType: 'printableArea' });
    expect(mocks.printOptions).not.toHaveProperty('pageSize');
    expect(mocks.fileAtLoad).not.toContain('max-width: 80mm !important');
    expect(mocks.fileAtLoad).not.toContain('body > *');
  });

  it('lays the receipt out in the useful width saved for the target printer (spec 95)', async () => {
    mocks.usefulWidths = { 'EPSON TM-T20': 72 };

    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'EPSON TM-T20', id: ID });

    expect(mocks.printOptions?.margins).toEqual({ marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 });
    expect(mocks.printOptions?.pageSize).toEqual({ width: 72_000, height: 297_000 });
    expect(mocks.fileAtLoad).toContain('body > * { max-width: 72mm !important; }');
  });

  // Anything before the doctype is quirks mode (printFonts.ts); after <html> and before the API's own <style>.
  it('injects the width block after the doctype and <html>, ahead of the document styles', async () => {
    mocks.usefulWidths = { 'EPSON TM-T20': 72 };

    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'EPSON TM-T20', id: ID });

    const html = mocks.fileAtLoad;
    const injected = html.indexOf('body > * { max-width: 72mm');

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(injected).toBeGreaterThan(html.indexOf('<html>'));
    expect(injected).toBeLessThan(html.indexOf('@page { size: 80mm auto; margin: 0; }'));
  });

  it('matches the saved width the way the print matches the printer, ignoring case', async () => {
    mocks.usefulWidths = { 'EPSON TM-T20': 70 };

    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'epson tm-t20', id: ID });

    expect(mocks.printOptions?.pageSize).toEqual({ width: 70_000, height: 297_000 });
  });

  // The shape Electron 43 really returns: no isDefault on any printer (measured on Linux/CUPS). The default is the
  // one the operating system names, and it is what the API's device_name null prints on.
  // Printed BY NAME on the default it resolved: leaving the device empty was measured to queue nothing at all on a
  // fresh process (Linux/CUPS) while the callback said success, and the name is the one Electron itself listed.
  it.each([null, 'Unknown printer'])(
    'prints %s on the system default printer, by name, in its useful width',
    async deviceName => {
      mocks.printers = [{ name: 'EPSON TM-T20' }, { name: 'Cozinha' }];
      mocks.systemDefault = 'COZINHA';
      mocks.usefulWidths = { 'EPSON TM-T20': 72, Cozinha: 48 };

      await printReceipt({ content: API_HTML, copies: 1, deviceName, id: ID });

      expect(mocks.printOptions?.pageSize).toEqual({ width: 48_000, height: 297_000 });
      expect(mocks.printOptions?.deviceName).toBe('Cozinha');
    }
  );

  it('forces nothing when the operating system names no default, or one that is not installed', async () => {
    mocks.printers = [{ name: 'EPSON TM-T20' }];
    mocks.usefulWidths = { 'EPSON TM-T20': 72 };

    for (const systemDefault of [null, 'Microsoft Print to PDF']) {
      mocks.systemDefault = systemDefault;
      await printReceipt({ content: API_HTML, copies: 1, deviceName: null, id: ID });

      expect(mocks.printOptions?.margins).toEqual({ marginType: 'printableArea' });
      expect(mocks.printOptions).not.toHaveProperty('pageSize');
    }
  });

  it('still takes a printer the platform flags as default, before asking the system', async () => {
    mocks.printers = [{ name: 'EPSON TM-T20' }, { name: 'Cozinha', isDefault: true }];
    mocks.systemDefault = 'EPSON TM-T20';
    mocks.usefulWidths = { 'EPSON TM-T20': 72, Cozinha: 48 };

    await printReceipt({ content: API_HTML, copies: 1, deviceName: null, id: ID });

    expect(mocks.printOptions?.pageSize).toEqual({ width: 48_000, height: 297_000 });
  });

  it('forces the roll page when the driver exposes a paper too short for a receipt, and warns', async () => {
    mocks.printers = [{ name: 'EPSON TM-T20', options: { media: 'oe_roll-80_80x25mm' } }];

    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'EPSON TM-T20', id: ID });

    expect(mocks.printOptions?.margins).toEqual({ marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 });
    expect(mocks.printOptions?.pageSize).toEqual({ width: 80_000, height: 297_000 });
    expect(mocks.log.warn).toHaveBeenCalledWith(
      'print-geometry: the driver declares an invalid paper, forcing pageSize',
      expect.objectContaining({ device: 'EPSON TM-T20' })
    );
  });

  it('prints the measuring page over the whole roll even when a useful width is saved', async () => {
    mocks.usefulWidths = { 'EPSON TM-T20': 72 };

    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'EPSON TM-T20', id: ID, measurePaperWidthMm: 80 });

    expect(mocks.printOptions?.pageSize).toEqual({ width: 80_000, height: 297_000 });
    expect(mocks.fileAtLoad).not.toContain('body > *');
    expect(mocks.log.info).toHaveBeenCalledWith('print-geometry', expect.objectContaining({ reason: 'measure' }));
  });

  it('logs the geometry of every print, and nothing of the receipt', async () => {
    mocks.printers = [{ name: 'EPSON TM-T20', options: { media: 'A4', 'printer-location': 'Caixa' } }];
    mocks.usefulWidths = { 'EPSON TM-T20': 72 };

    await printReceipt({ content: API_HTML, copies: 1, deviceName: 'EPSON TM-T20', id: ID });

    expect(mocks.log.info).toHaveBeenCalledTimes(1);
    expect(mocks.log.info).toHaveBeenCalledWith('print-geometry', {
      device: 'EPSON TM-T20',
      matched: true,
      driverMedia: { media: 'A4' },
      driverPaper: null,
      marginType: 'custom',
      pageSize: { width: 72_000, height: 297_000 },
      usefulWidthMm: 72,
      reason: 'useful-width',
    });
    expect(JSON.stringify(mocks.log.info.mock.calls)).not.toContain('PEDIDO');
  });

  it('keeps the rest of the options: silent, mono, uncollated, the payload copies', async () => {
    await printReceipt({ content: '<html></html>', copies: 3, deviceName: null, id: ID });

    expect(mocks.printOptions).toMatchObject({ silent: true, color: false, collate: false, copies: 3 });
  });

  it('matches the Windows printer ignoring case', async () => {
    await printReceipt({ content: '<html></html>', copies: 1, deviceName: 'epson tm-t20', id: ID });

    expect(mocks.printOptions?.deviceName).toBe('EPSON TM-T20');
  });

  // Only when the system names no installed default: then Electron picks one by itself, as before spec 95.
  it.each([null, 'Unknown printer'])(
    'leaves the choice to Electron for %s when the system names no installed default',
    async deviceName => {
      mocks.systemDefault = null;

      await printReceipt({ content: '<html></html>', copies: 1, deviceName, id: ID });

      expect(mocks.printOptions).toHaveProperty('deviceName', undefined);
    }
  );

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
