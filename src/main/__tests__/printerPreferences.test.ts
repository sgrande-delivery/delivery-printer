import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electron = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({ app: { getPath: () => electron.userData } }));

const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock('../logger', () => ({ logger: log }));

import {
  PRINTER_PREFERENCES_FILE,
  printerPreferenceFor,
  readPrinterPreferences,
  writePrinterUsefulWidth,
} from '../printerPreferences';
import { onSetPrinterUsefulWidth } from '../ipc-events/onSetPrinterUsefulWidth';
import { onPrinterPreferences } from '../ipc-events/onPrinterPreferences';

const event = {} as Parameters<typeof onSetPrinterUsefulWidth>[0];

function file(): string {
  return path.join(electron.userData, PRINTER_PREFERENCES_FILE);
}

function writeRaw(content: string): void {
  fs.writeFileSync(file(), content);
}

function readRaw(): unknown {
  return JSON.parse(fs.readFileSync(file(), 'utf8'));
}

describe('printer preferences file', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-prefs-'));
    log.warn.mockClear();
    log.error.mockClear();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('reads nothing, warns nothing and creates nothing when the file is absent', () => {
    expect(readPrinterPreferences()).toEqual({});
    expect(log.warn).not.toHaveBeenCalled();
    expect(fs.existsSync(file())).toBe(false);
  });

  it.each([
    ['invalid JSON', '{ "devices": '],
    ['an array', '[]'],
    ['devices that is not an object', '{ "devices": [72] }'],
  ])('treats %s as every printer automatic, warns, and leaves the file as it was', (_case, content) => {
    writeRaw(content);

    expect(readPrinterPreferences()).toEqual({});
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(file(), 'utf8')).toBe(content);
  });

  it('drops each entry it cannot vouch for and keeps the valid ones beside it', () => {
    writeRaw(
      JSON.stringify({
        devices: {
          Low: { usefulWidthMm: 30 },
          High: { usefulWidthMm: 90 },
          Fraction: { usefulWidthMm: 72.5 },
          Text: { usefulWidthMm: '72' },
          Bare: 72,
          'EPSON TM-T20': { usefulWidthMm: 72 },
        },
      })
    );

    expect(readPrinterPreferences()).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } });
    expect(log.warn).toHaveBeenCalledTimes(5);
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ deviceName: 'High' }));
  });

  it('reads back what it wrote, and null makes the printer automatic again', () => {
    expect(writePrinterUsefulWidth('EPSON TM-T20', 72)).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } });
    expect(readPrinterPreferences()).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } });

    expect(writePrinterUsefulWidth('EPSON TM-T20', null)).toEqual({});
    expect(readPrinterPreferences()).toEqual({});
  });

  it('replaces the same device under another spelling instead of keeping two entries', () => {
    writePrinterUsefulWidth('EPSON TM-T20', 72);
    writePrinterUsefulWidth('epson tm-t20', 70);

    expect(readPrinterPreferences()).toEqual({ 'epson tm-t20': { usefulWidthMm: 70 } });

    writePrinterUsefulWidth('EPSON TM-T20', null);

    expect(readPrinterPreferences()).toEqual({});
  });

  it('keeps an unknown root key, the other devices and an entry this version cannot read', () => {
    writeRaw(
      JSON.stringify({
        future: { keep: true },
        devices: { Cozinha: { usefulWidthMm: 48 }, Broken: { usefulWidthMm: 'oops' } },
      })
    );

    writePrinterUsefulWidth('EPSON TM-T20', 72);

    expect(readRaw()).toEqual({
      future: { keep: true },
      devices: {
        Cozinha: { usefulWidthMm: 48 },
        Broken: { usefulWidthMm: 'oops' },
        'EPSON TM-T20': { usefulWidthMm: 72 },
      },
    });
  });

  it('keeps the other fields of the entry it writes, even under another spelling', () => {
    writeRaw(JSON.stringify({ devices: { 'EPSON TM-T20': { usefulWidthMm: 72, note: 'medido em 13/11' } } }));

    writePrinterUsefulWidth('epson tm-t20', 70);

    expect(readRaw()).toEqual({ devices: { 'epson tm-t20': { usefulWidthMm: 70, note: 'medido em 13/11' } } });
  });

  it('reads a file saved with a BOM, as Notepad and PowerShell 5.1 write it', () => {
    writeRaw(`\uFEFF${JSON.stringify({ devices: { 'EPSON TM-T20': { usefulWidthMm: 72 } } })}`);

    expect(readPrinterPreferences()).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('drops an empty device name, which only a hand edit can produce', () => {
    writeRaw(JSON.stringify({ devices: { '': { usefulWidthMm: 72 } } }));

    expect(readPrinterPreferences()).toEqual({});
    expect(printerPreferenceFor('')).toBeUndefined();
  });

  it('refuses to write over a file that exists but could not be read, so no other printer is erased', () => {
    // A directory where the file should be: readFileSync fails with EISDIR, not ENOENT, the same branch an
    // antivirus lock or a permission takes on the PDV.
    fs.mkdirSync(file());

    expect(() => writePrinterUsefulWidth('EPSON TM-T20', 72)).toThrow('could not be read');
    expect(fs.statSync(file()).isDirectory()).toBe(true);
    expect(log.warn).toHaveBeenCalledWith('printer-preferences: could not read the file', expect.anything());
  });

  it('starts over from a file that is not JSON on write, since the write is the only way out of it', () => {
    writeRaw('not json');

    writePrinterUsefulWidth('EPSON TM-T20', 72);

    expect(readRaw()).toEqual({ devices: { 'EPSON TM-T20': { usefulWidthMm: 72 } } });
  });

  it.each([
    ['below the range', 'EPSON TM-T20', 39],
    ['above the range', 'EPSON TM-T20', 81],
    ['a fraction', 'EPSON TM-T20', 72.5],
    ['an empty device name', '', 72],
  ])('refuses %s and does not touch the file', (_case, deviceName, width) => {
    writePrinterUsefulWidth('Cozinha', 48);
    const before = fs.readFileSync(file(), 'utf8');

    expect(() => writePrinterUsefulWidth(deviceName, width)).toThrow();
    expect(fs.readFileSync(file(), 'utf8')).toBe(before);
  });

  it('finds the preference of a device the way the print matches it', () => {
    writePrinterUsefulWidth('EPSON TM-T20', 72);

    expect(printerPreferenceFor('epson TM-T20')).toEqual({ usefulWidthMm: 72 });
    expect(printerPreferenceFor(null)).toBeUndefined();
    expect(printerPreferenceFor('Cozinha')).toBeUndefined();
  });
});

describe('printer preferences channels', () => {
  beforeEach(() => {
    electron.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'printer-prefs-ipc-'));
    log.error.mockClear();
  });

  afterEach(() => {
    fs.rmSync(electron.userData, { recursive: true, force: true });
  });

  it('saves a well-formed request and the read channel returns it', () => {
    expect(onSetPrinterUsefulWidth(event, { deviceName: 'EPSON TM-T20', usefulWidthMm: 72 })).toEqual({
      'EPSON TM-T20': { usefulWidthMm: 72 },
    });
    expect(onPrinterPreferences()).toEqual({ 'EPSON TM-T20': { usefulWidthMm: 72 } });
  });

  it.each([
    ['nothing', undefined],
    ['an empty object', {}],
    ['a numeric device name', { deviceName: 7, usefulWidthMm: 72 }],
    ['a width as text', { deviceName: 'EPSON TM-T20', usefulWidthMm: '72' }],
    ['a missing width', { deviceName: 'EPSON TM-T20' }],
    ['a width out of range', { deviceName: 'EPSON TM-T20', usefulWidthMm: 90 }],
    ['an empty device name', { deviceName: '', usefulWidthMm: 72 }],
  ])('refuses %s without writing, and without calling it a failed write', (_case, request) => {
    expect(() => onSetPrinterUsefulWidth(event, request)).toThrow('invalid useful width request');
    expect(fs.existsSync(file())).toBe(false);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs and rethrows a write that failed', () => {
    fs.mkdirSync(file());

    expect(() => onSetPrinterUsefulWidth(event, { deviceName: 'EPSON TM-T20', usefulWidthMm: 72 })).toThrow();
    expect(log.error).toHaveBeenCalledWith(
      'printer-preferences: could not save the useful width',
      expect.objectContaining({ deviceName: 'EPSON TM-T20', usefulWidthMm: 72 })
    );
  });
});
