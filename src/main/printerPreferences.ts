import { app } from 'electron';
import path from 'node:path';
import { isSameDeviceName } from 'shared/printerMatch';
import { findPrinterPreference, isUsefulWidthMm } from 'shared/printerGeometry';
import type { PrinterPreference, PrinterPreferences } from 'shared/printerGeometry';
import { writeFileAtomic } from './atomicFile';
import { isJsonObject, readJsonObject, readJsonObjectFile, type JsonObject } from './jsonObjectFile';
import { logger } from './logger';

// Its own file, not ui-preferences.json (spec 95, RN-01): what lives here changes how every receipt is laid
// out, and it is read on the print path. On disk: { "devices": { "<Windows device>": { "usefulWidthMm": 72 } } },
// an object at the root so a later printer preference needs no migration.
export const PRINTER_PREFERENCES_FILE = 'printer-preferences.json';

const SCOPE = 'printer-preferences';

function preferencesPath(): string {
  return path.join(app.getPath('userData'), PRINTER_PREFERENCES_FILE);
}

type InvalidEntry = (deviceName: string, entry: unknown) => void;

function validDevices(devices: JsonObject, onInvalid?: InvalidEntry): PrinterPreferences {
  const result: PrinterPreferences = {};

  for (const [deviceName, entry] of Object.entries(devices)) {
    const width = isJsonObject(entry) ? entry.usefulWidthMm : undefined;

    // An empty key can only come from a hand edit, and it would match a print with an empty device name.
    if (deviceName !== '' && isUsefulWidthMm(width)) {
      result[deviceName] = { usefulWidthMm: width };
    } else {
      onInvalid?.(deviceName, entry);
    }
  }

  return result;
}

// Never throws and never writes (readJsonObjectFile). An entry the file cannot vouch for is dropped, so that
// printer is automatic again, and the rest survive: the file is editable by hand (spec 95, RN-13).
export function readPrinterPreferences(): PrinterPreferences {
  const devices = readJsonObject(preferencesPath(), SCOPE)?.devices;

  if (devices === undefined) {
    return {};
  }

  if (!isJsonObject(devices)) {
    logger.warn(`${SCOPE}: "devices" is not an object, every printer is automatic`);

    return {};
  }

  return validDevices(devices, (deviceName, entry) =>
    logger.warn(`${SCOPE}: invalid useful width, the printer stays automatic`, { deviceName, entry })
  );
}

// null removes the entry (back to automatic). Read-modify-write over the object on disk: an unknown root key,
// the other devices, their entries this version cannot read and any other field of the entry being written are
// kept as they were, because a write is not the place to destroy a hand edit. A width outside the range is
// refused, not clamped (RN-13). A file that is there but could not be read is refused too: starting over from {}
// would erase every other printer, which is a receipt cut again with nothing on screen to say why. One that was
// read but is not JSON is started over — the write is the only way out of it.
// Resolves to the map that now applies, which is what the screen adopts.
export function writePrinterUsefulWidth(deviceName: string, usefulWidthMm: number | null): PrinterPreferences {
  if (deviceName === '') {
    throw new Error(`${SCOPE}: the device name is empty`);
  }

  if (usefulWidthMm !== null && !isUsefulWidthMm(usefulWidthMm)) {
    throw new Error(`${SCOPE}: useful width out of range: ${String(usefulWidthMm)}`);
  }

  const read = readJsonObjectFile(preferencesPath(), SCOPE);

  if (read.status === 'unreadable') {
    throw new Error(`${SCOPE}: the file exists but could not be read; not overwriting it`);
  }

  const stored = read.status === 'ok' ? read.value : {};
  const devices: JsonObject = isJsonObject(stored.devices) ? { ...stored.devices } : {};
  let previous: JsonObject = {};

  // The same device under another spelling is the same entry (RN-02): it is replaced, never duplicated.
  for (const name of Object.keys(devices)) {
    if (isSameDeviceName(name, deviceName)) {
      const entry = devices[name];
      previous = isJsonObject(entry) ? { ...previous, ...entry } : previous;
      delete devices[name];
    }
  }

  if (usefulWidthMm !== null) {
    devices[deviceName] = { ...previous, usefulWidthMm };
  }

  // Indented, unlike ui-preferences.json: support reads and edits this one by hand on the PDV.
  writeFileAtomic(preferencesPath(), `${JSON.stringify({ ...stored, devices }, null, 2)}\n`);

  return validDevices(devices);
}

// Read on every call, no cache: the file is tiny, and a width saved on the screen applies to the next receipt
// with no invalidation channel (spec 95, plan).
export function printerPreferenceFor(deviceName: string | null | undefined): PrinterPreference | undefined {
  return findPrinterPreference(readPrinterPreferences(), deviceName);
}
