import type { IpcMainInvokeEvent } from 'electron';
import { describeError } from 'shared/describeError';
import { isPageHeightMm } from 'shared/printerGeometry';
import type { PrinterPreferences } from 'shared/printerGeometry';
import { isJsonObject } from '../jsonObjectFile';
import { logger } from '../logger';
import { writePrinterPageHeight } from '../printerPreferences';

type SetPageHeightRequest = { deviceName: string; pageHeightMm: number | null };

// The renderer is untyped at runtime. The range is checked here too, so that what reaches the catch below is
// a failed write and nothing else.
function isSetPageHeightRequest(value: unknown): value is SetPageHeightRequest {
  return (
    isJsonObject(value) &&
    typeof value.deviceName === 'string' &&
    value.deviceName !== '' &&
    (value.pageHeightMm === null || isPageHeightMm(value.pageHeightMm))
  );
}

// Rejects for a malformed request or a height outside the range (nothing is written then), for a device with
// no useful width saved (there is nothing to apply the height to), and for a write that failed.
export function onSetPrinterPageHeight(_event: IpcMainInvokeEvent, request: unknown): PrinterPreferences {
  if (!isSetPageHeightRequest(request)) {
    throw new Error('invalid page height request');
  }

  try {
    return writePrinterPageHeight(request.deviceName, request.pageHeightMm);
  } catch (err: unknown) {
    logger.error('printer-preferences: could not save the page height', {
      deviceName: request.deviceName,
      pageHeightMm: request.pageHeightMm,
      ...describeError(err),
    });
    throw err;
  }
}
