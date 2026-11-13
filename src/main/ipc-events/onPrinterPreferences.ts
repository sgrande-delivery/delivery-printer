import type { PrinterPreferences } from 'shared/printerGeometry';
import { readPrinterPreferences } from '../printerPreferences';

// Never rejects: the read never throws, and an unreadable file is "every printer automatic".
export function onPrinterPreferences(): PrinterPreferences {
  return readPrinterPreferences();
}
