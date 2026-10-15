import { describe, expect, it } from 'vitest';
import { findPrinterByDeviceName } from '../printerMatch';

const printers = [{ name: 'COZINHA' }, { name: 'EPSON TM-T20' }];

describe('findPrinterByDeviceName', () => {
  it('matches ignoring letter case', () => {
    expect(findPrinterByDeviceName(printers, 'cozinha')).toEqual({ name: 'COZINHA' });
  });

  it('does not match with surrounding spaces, because Windows reports the exact name', () => {
    expect(findPrinterByDeviceName(printers, 'Cozinha ')).toBeUndefined();
  });

  it('returns the first match, because a registered name is not unique', () => {
    const duplicated = [
      { name: 'Cozinha', id: 1 },
      { name: 'cozinha', id: 2 },
    ];

    expect(findPrinterByDeviceName(duplicated, 'COZINHA')).toEqual({ name: 'Cozinha', id: 1 });
  });

  // A miss is how the receipt ends up on the system default printer, silently.
  it('finds nothing for a null or unknown device name', () => {
    expect(findPrinterByDeviceName(printers, null)).toBeUndefined();
    expect(findPrinterByDeviceName(printers, undefined)).toBeUndefined();
    expect(findPrinterByDeviceName(printers, 'Balcao')).toBeUndefined();
  });
});
