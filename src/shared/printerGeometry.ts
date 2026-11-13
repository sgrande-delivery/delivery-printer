// The useful width of a printer: how many millimetres of the roll its head really prints, measured by the
// operator on the test page and saved on this machine (spec 95). In shared/ because both ends need the same
// range: the main process applies it to every print, the printers screen offers it. Typed twice, the two
// would drift. Pure on purpose: this file is in the include of both tsconfigs, so no node: and no DOM here.
import { isSameDeviceName } from './printerMatch';

// 40 is below the narrowest head of the fleet (384 dots at 203 dpi, 48 mm, on a 58 mm roll); 80 is the wider
// of the two rolls this app lays the test page out for (`paperWidth: 58 | 80`, shared/testPrintContent). Unlike
// the sidebar width, a value outside the range is NOT clamped: a width adjusted in silence is a receipt cut in
// silence, and "automatic" is the behaviour everyone knows.
export const USEFUL_WIDTH_MIN_MM = 40;
export const USEFUL_WIDTH_MAX_MM = 80;

export type PrinterPreference = { usefulWidthMm: number };

// Keyed by the Windows device name, as Windows reports it: a physical fact of this machine, not of a
// registration in the API (two registrations pointing to one device share it).
export type PrinterPreferences = Record<string, PrinterPreference>;

export function isUsefulWidthMm(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= USEFUL_WIDTH_MIN_MM && value <= USEFUL_WIDTH_MAX_MM
  );
}

// The same criterion that picks where a receipt goes (shared/printerMatch): a looser one here would make
// the screen show a width the print never applies, or the other way round, and neither fails loudly.
export function findPrinterPreference(
  preferences: PrinterPreferences,
  deviceName: string | null | undefined
): PrinterPreference | undefined {
  const name = Object.keys(preferences).find(key => isSameDeviceName(key, deviceName));

  return name === undefined ? undefined : preferences[name];
}
