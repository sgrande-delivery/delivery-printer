import { describe, expect, it } from 'vitest';
import { buildTestPrintPage } from '../testPrintPage';

const request = { printerName: 'Cozinha', stationLabel: 'Cozinha', paperWidth: 80, deviceName: 'EPSON TM-T20' };
const now = new Date(2026, 9, 15, 14, 30, 5);

describe('buildTestPrintPage', () => {
  it('shows what lets the operator check the right printer got it', () => {
    const html = buildTestPrintPage({ ...request, printerName: 'Balcão' }, '2.7.0', now);

    expect(html).toContain('Balcão');
    expect(html).toContain('EPSON TM-T20');
    expect(html).toContain('2.7.0');
    expect(html).toContain(now.toLocaleString('pt-BR'));
    expect(html).toContain('Setor: Cozinha');
  });

  it('says the system default when no device was resolved', () => {
    expect(buildTestPrintPage({ ...request, deviceName: null }, '2.7.0', now)).toContain('padrão do Windows');
  });

  it('draws a different frame for 58 mm and 80 mm', () => {
    const narrow = buildTestPrintPage({ ...request, paperWidth: 58 }, '2.7.0', now);
    const wide = buildTestPrintPage(request, '2.7.0', now);

    expect(narrow).toContain('width: 58mm');
    expect(wide).toContain('width: 80mm');
    expect(narrow).not.toEqual(wide);
  });

  it('falls back to 80 mm for a width that is not one of the two', () => {
    expect(buildTestPrintPage({ ...request, paperWidth: 72 }, '2.7.0', now)).toContain('width: 80mm');
  });

  it('escapes the names it prints', () => {
    const html = buildTestPrintPage({ ...request, printerName: '<script>x</script>' }, '2.7.0', now);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
