import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stdout: '' as string,
  error: null as Error | null,
  calls: [] as { file: string; args: string[]; env?: NodeJS.ProcessEnv }[],
  warn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv },
    callback: (err: Error | null, stdout: string) => void
  ) => {
    mocks.calls.push({ file, args, env: options.env });
    callback(mocks.error, mocks.stdout);
  },
}));

vi.mock('../logger', () => ({ logger: { warn: mocks.warn } }));

import {
  parseLpstatDefault,
  parseWindowsDefaultDevice,
  readDefaultPrinterName,
  resetDefaultPrinterCache,
} from '../defaultPrinter';

describe('parseWindowsDefaultDevice', () => {
  // The shape `reg query ... /v Device` prints, blank lines and all.
  it('takes the printer name before the first comma of the Device value', () => {
    const stdout =
      '\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\r\n' +
      '    Device    REG_SZ    EPSON TM-T20 Receipt,winspool,Ne01:\r\n\r\n';

    expect(parseWindowsDefaultDevice(stdout)).toBe('EPSON TM-T20 Receipt');
  });

  it.each([
    ['no Device value', 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\r\n'],
    ['an empty name', '    Device    REG_SZ    ,winspool,Ne01:\r\n'],
    ['nothing', ''],
  ])('is null for %s', (_case, stdout) => {
    expect(parseWindowsDefaultDevice(stdout)).toBeNull();
  });
});

describe('parseLpstatDefault', () => {
  it('reads the name lpstat -d prints under LC_ALL=C', () => {
    expect(parseLpstatDefault('system default destination: Cups-PDF\n')).toBe('Cups-PDF');
  });

  it('is null when there is no default', () => {
    expect(parseLpstatDefault('no system default destination\n')).toBeNull();
  });
});

describe('readDefaultPrinterName', () => {
  const platform = process.platform;

  beforeEach(() => {
    resetDefaultPrinterCache();
    mocks.stdout = '';
    mocks.error = null;
    mocks.calls = [];
    mocks.warn.mockClear();
    Object.defineProperty(process, 'platform', { value: platform });
  });

  it('asks the Windows registry on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    mocks.stdout = '    Device    REG_SZ    Bematech MP-4200 TH,winspool,USB001\r\n';

    await expect(readDefaultPrinterName()).resolves.toBe('Bematech MP-4200 TH');
    expect(mocks.calls[0].file).toMatch(/reg\.exe$/i);
    expect(mocks.calls[0].args).toEqual([
      'query',
      'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows',
      '/v',
      'Device',
    ]);
  });

  it('asks lpstat elsewhere, untranslated', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mocks.stdout = 'system default destination: Cups-PDF\n';

    await expect(readDefaultPrinterName()).resolves.toBe('Cups-PDF');
    expect(mocks.calls[0]).toMatchObject({ file: 'lpstat', args: ['-d'] });
    expect(mocks.calls[0].env?.LC_ALL).toBe('C');
  });

  it('asks once per window, so a burst of receipts does not spawn a process each', async () => {
    mocks.stdout = 'system default destination: Cups-PDF\n';
    let now = 1_000;

    await readDefaultPrinterName(() => now);
    now += 29_000;
    await readDefaultPrinterName(() => now);
    expect(mocks.calls).toHaveLength(1);

    now += 2_000;
    await readDefaultPrinterName(() => now);
    expect(mocks.calls).toHaveLength(2);
  });

  it('never rejects: a failure is null, warned once and cached like an answer', async () => {
    mocks.error = new Error('spawn lpstat ENOENT');

    await expect(readDefaultPrinterName()).resolves.toBeNull();
    await expect(readDefaultPrinterName()).resolves.toBeNull();

    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.calls).toHaveLength(1);
  });
});
