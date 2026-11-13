import { execFile } from 'node:child_process';
import path from 'node:path';
import { describeError } from 'shared/describeError';
import { logger } from './logger';

// Which printer the system default is. Electron 43 does not say: PrinterInfo has no isDefault, neither in the
// typings nor at runtime (measured on Linux/CUPS, spec 95), and webContents.print picks the default by itself
// without naming it. The print needs the name anyway — a receipt the API sends with device_name null (a store
// that does not split by printer, every table bill) goes to the default, and the useful width that applies is
// that printer's — so it asks the operating system.

// `reg query "HKCU\...\Windows" /v Device` prints the value as `Device    REG_SZ    <name>,winspool,<port>`.
// REG_SZ is not localized, and a Windows printer name cannot hold a comma, so the name is what precedes the
// first one.
export function parseWindowsDefaultDevice(stdout: string): string | null {
  const value = /^\s*Device\s+REG_SZ\s+(.+?)\s*$/m.exec(stdout)?.[1];
  const name = value?.split(',')[0].trim();

  return name ? name : null;
}

// `lpstat -d`, run under LC_ALL=C so the label is not translated: `system default destination: <name>`, or
// `no system default destination`.
export function parseLpstatDefault(stdout: string): string | null {
  const name = /^system default destination:\s*(.+?)\s*$/m.exec(stdout)?.[1];

  return name ? name : null;
}

const TIMEOUT_MS = 2_000;

function run(file: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: TIMEOUT_MS, windowsHide: true, env }, (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    );
  });
}

async function query(): Promise<string | null> {
  if (process.platform === 'win32') {
    const reg = path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe');
    const stdout = await run(reg, [
      'query',
      'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows',
      '/v',
      'Device',
    ]);

    return parseWindowsDefaultDevice(stdout);
  }

  return parseLpstatDefault(await run('lpstat', ['-d'], { ...process.env, LC_ALL: 'C' }));
}

// Long enough that a burst of receipts asks once, short enough that changing the default in Windows shows up on
// the next order. A failure is cached too, so a missing tool warns once per window, not once per receipt.
const CACHE_MS = 30_000;

let cached: { name: string | null; at: number } | null = null;

// Never rejects: not knowing the default is "no useful width applies", which is the behaviour without one.
export async function readDefaultPrinterName(now: () => number = Date.now): Promise<string | null> {
  if (cached && now() - cached.at < CACHE_MS) {
    return cached.name;
  }

  let name: string | null = null;

  try {
    name = await query();
  } catch (err: unknown) {
    logger.warn('default-printer: could not ask the system which printer is the default', describeError(err));
  }

  cached = { name, at: now() };

  return name;
}

export function resetDefaultPrinterCache(): void {
  cached = null;
}
