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

// A altura da página que o app força quando a geometria é explícita (spec 101). 297 é o papel padrão da
// maioria dos drivers do parque e o valor de até a 3.2.0; 3000 cobre a bobina de 3 m do relato com folga.
// O piso é 297 porque abaixo dele a mudança só criaria corte novo, e fora da faixa é recusado, nunca
// ajustado: altura ajustada em silêncio é comprovante cortado em silêncio (RN-04).
export const PAGE_HEIGHT_MIN_MM = 297;
export const PAGE_HEIGHT_MAX_MM = 3000;
export const DEFAULT_PAGE_HEIGHT_MM = 297;

// `pageHeightMm` é opcional: quem faz a entrada existir é a largura útil, e uma altura ilegível derruba só o
// campo (RN-03) — derrubar a entrada deixaria a impressora automática e devolveria o corte à direita.
export type PrinterPreference = { usefulWidthMm: number; pageHeightMm?: number };

// Keyed by the Windows device name, as Windows reports it: a physical fact of this machine, not of a
// registration in the API (two registrations pointing to one device share it).
export type PrinterPreferences = Record<string, PrinterPreference>;

export function isPageHeightMm(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= PAGE_HEIGHT_MIN_MM && value <= PAGE_HEIGHT_MAX_MM
  );
}

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
