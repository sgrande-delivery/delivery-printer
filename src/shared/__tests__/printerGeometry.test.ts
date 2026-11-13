import { describe, expect, it } from 'vitest';
import { USEFUL_WIDTH_MAX_MM, USEFUL_WIDTH_MIN_MM, findPrinterPreference, isUsefulWidthMm } from '../printerGeometry';

describe('isUsefulWidthMm', () => {
  it.each([USEFUL_WIDTH_MIN_MM, 48, 72, USEFUL_WIDTH_MAX_MM])('accepts %s', value => {
    expect(isUsefulWidthMm(value)).toBe(true);
  });

  // Not clamped: each of these would otherwise print a receipt at a width nobody chose.
  it.each([39, 81, 72.5, Number.NaN, Number.POSITIVE_INFINITY, '72', null, undefined])('refuses %s', value => {
    expect(isUsefulWidthMm(value)).toBe(false);
  });
});

describe('findPrinterPreference', () => {
  const preferences = { 'EPSON TM-T20': { usefulWidthMm: 72 }, Cozinha: { usefulWidthMm: 48 } };

  it('matches the whole device name ignoring case, like the print does', () => {
    expect(findPrinterPreference(preferences, 'epson tm-t20')).toEqual({ usefulWidthMm: 72 });
    expect(findPrinterPreference(preferences, 'COZINHA')).toEqual({ usefulWidthMm: 48 });
  });

  it.each([null, undefined, 'EPSON', 'EPSON TM-T20 ', ''])('finds nothing for %j', deviceName => {
    expect(findPrinterPreference(preferences, deviceName)).toBeUndefined();
  });
});
