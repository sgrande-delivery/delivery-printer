import type { IpcMainInvokeEvent } from 'electron';
import { describeError } from 'shared/describeError';
import { isUsefulWidthMm } from 'shared/printerGeometry';
import type { PrinterPreferences } from 'shared/printerGeometry';
import { isJsonObject } from '../jsonObjectFile';
import { logger } from '../logger';
import { writePrinterUsefulWidth } from '../printerPreferences';

type SetUsefulWidthRequest = { deviceName: string; usefulWidthMm: number | null };

// The renderer is untyped at runtime. The range is checked here too, so that what reaches the catch below is
// a failed write and nothing else.
function isSetUsefulWidthRequest(value: unknown): value is SetUsefulWidthRequest {
  return (
    isJsonObject(value) &&
    typeof value.deviceName === 'string' &&
    value.deviceName !== '' &&
    (value.usefulWidthMm === null || isUsefulWidthMm(value.usefulWidthMm))
  );
}

// Rejects for a malformed request or a width outside the range (nothing is written then), and for a write
// that failed, which is also logged: the screen says it, the log says why.
export function onSetPrinterUsefulWidth(_event: IpcMainInvokeEvent, request: unknown): PrinterPreferences {
  if (!isSetUsefulWidthRequest(request)) {
    throw new Error('invalid useful width request');
  }

  try {
    return writePrinterUsefulWidth(request.deviceName, request.usefulWidthMm);
  } catch (err: unknown) {
    logger.error('printer-preferences: could not save the useful width', {
      deviceName: request.deviceName,
      usefulWidthMm: request.usefulWidthMm,
      ...describeError(err),
    });
    throw err;
  }
}
