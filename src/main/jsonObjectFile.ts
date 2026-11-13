import fs from 'node:fs';
import { describeError } from 'shared/describeError';
import { logger } from './logger';

export type JsonObject = Record<string, unknown>;

// What a read found. 'unreadable' (the file is there and the OS refused it: a lock, a permission, an
// antivirus) is told apart from 'invalid' (read, but not a JSON object), because a writer may start over from
// an invalid file — the write is the only way out of it — but starting over from one it could not even read
// would erase every key it holds.
export type JsonObjectRead =
  { status: 'ok'; value: JsonObject } | { status: 'absent' } | { status: 'unreadable' } | { status: 'invalid' };

// Notepad's "UTF-8 with BOM" and PowerShell 5.1's `-Encoding UTF8` both write one, and JSON.parse refuses it:
// a settings file edited by hand on the PDV would read as garbage.
const BOM = /^\uFEFF/;

// Never throws and never writes: a settings file that cannot be read must not stop the app from opening
// (nor, for the printer one, a receipt from printing), and a read must not rewrite what it could not
// understand. An absent file is the normal first run, so it is not logged; `scope` prefixes every warning so
// the log says which file it was.
export function readJsonObjectFile(file: string, scope: string): JsonObjectRead {
  let raw: string;

  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err: unknown) {
    if (isJsonObject(err) && err.code === 'ENOENT') {
      return { status: 'absent' };
    }

    logger.warn(`${scope}: could not read the file`, describeError(err));

    return { status: 'unreadable' };
  }

  try {
    const parsed: unknown = JSON.parse(raw.replace(BOM, ''));

    if (isJsonObject(parsed)) {
      return { status: 'ok', value: parsed };
    }

    logger.warn(`${scope}: the file is not an object`);
  } catch (err: unknown) {
    logger.warn(`${scope}: the file is not valid JSON`, describeError(err));
  }

  return { status: 'invalid' };
}

// null means "nothing usable", whatever the reason.
export function readJsonObject(file: string, scope: string): JsonObject | null {
  const read = readJsonObjectFile(file, scope);

  return read.status === 'ok' ? read.value : null;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
