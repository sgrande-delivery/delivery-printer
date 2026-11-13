import { describe, expect, it } from 'vitest';
import {
  ROLL_PAGE_HEIGHT_MICRONS,
  documentWidthMm,
  driverMediaOptions,
  driverPaperMm,
  resolvePrintGeometry,
} from '../printGeometry';

describe('resolvePrintGeometry', () => {
  it('forces nothing when no width is saved and the driver exposes no paper', () => {
    const geometry = resolvePrintGeometry({
      usefulWidthMm: null,
      driverPaper: null,
      measurePaperWidthMm: null,
      documentWidthMm: 80,
    });

    expect(geometry).toEqual({ reason: 'printable-area', margins: { marginType: 'printableArea' }, widthCss: null });
    expect(geometry).not.toHaveProperty('pageSize');
  });

  it('lays a useful width out explicitly: W-wide roll page, zero custom margins, a max-width that wins', () => {
    const geometry = resolvePrintGeometry({
      usefulWidthMm: 72,
      driverPaper: null,
      measurePaperWidthMm: null,
      documentWidthMm: 80,
    });

    expect(geometry.reason).toBe('useful-width');
    expect(geometry.margins).toEqual({ marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 });
    expect(geometry.pageSize).toEqual({ width: 72_000, height: ROLL_PAGE_HEIGHT_MICRONS });
    // !important on each rule: the block is injected before the API's own <style>s and would lose by order.
    expect(geometry.widthCss).toContain('body > * { max-width: 72mm !important; }');
    // The same page the pageSize option asks for, in a form the `size` grammar accepts.
    expect(geometry.widthCss).toContain('size: 72mm 297mm !important');
    expect(geometry.widthCss).toContain('margin: 0 !important');
  });

  it('lets a saved useful width win over an invalid paper the driver exposes', () => {
    const geometry = resolvePrintGeometry({
      usefulWidthMm: 48,
      driverPaper: { widthMm: 80, heightMm: 25 },
      measurePaperWidthMm: null,
      documentWidthMm: 80,
    });

    expect(geometry.reason).toBe('useful-width');
    expect(geometry.pageSize).toEqual({ width: 48_000, height: ROLL_PAGE_HEIGHT_MICRONS });
  });

  it.each([
    ['80 x 25', { widthMm: 80, heightMm: 25 }],
    ['80 x 0', { widthMm: 80, heightMm: 0 }],
    ['30 x 297', { widthMm: 30, heightMm: 297 }],
  ])('forces the roll page at the document width for a %s paper, with nothing injected', (_case, driverPaper) => {
    const geometry = resolvePrintGeometry({
      usefulWidthMm: null,
      driverPaper,
      measurePaperWidthMm: null,
      documentWidthMm: 58,
    });

    expect(geometry.reason).toBe('invalid-driver-paper');
    expect(geometry.margins).toEqual({ marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 });
    expect(geometry.pageSize).toEqual({ width: 58_000, height: ROLL_PAGE_HEIGHT_MICRONS });
    expect(geometry.widthCss).toBeNull();
  });

  // Spec 95, RN-11: measuring through a saved width would make the app cut the scale at the number saved.
  it('measures over the whole roll, over a saved width and over an invalid paper alike', () => {
    const geometry = resolvePrintGeometry({
      usefulWidthMm: 72,
      driverPaper: { widthMm: 80, heightMm: 25 },
      documentWidthMm: 80,
      measurePaperWidthMm: 58,
    });

    expect(geometry).toEqual({
      reason: 'measure',
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: 58_000, height: ROLL_PAGE_HEIGHT_MICRONS },
      widthCss: null,
    });
  });

  it.each([
    ['80 x 297', { widthMm: 80, heightMm: 297 }],
    ['40 x 50, the limit', { widthMm: 40, heightMm: 50 }],
  ])('trusts a %s paper and keeps the printable area', (_case, driverPaper) => {
    expect(
      resolvePrintGeometry({ usefulWidthMm: null, driverPaper, measurePaperWidthMm: null, documentWidthMm: 80 }).reason
    ).toBe('printable-area');
  });
});

describe('documentWidthMm', () => {
  it('reads the @page size of the delivery-api layout', () => {
    expect(documentWidthMm('<html><style>@page { size: 58mm auto; margin: 0; }</style></html>')).toBe(58);
  });

  // The `original` layout: the static CSS declares 80mm first (margin before size), the layout overrides it.
  it('takes the last @page, the one that wins the cascade', () => {
    const html =
      '<html><style>@page {\n    margin: 0;\n    size: 80mm auto;\n}</style>' +
      '<style>@page { size: 72mm auto; margin: 0; }</style></html>';

    expect(documentWidthMm(html)).toBe(72);
  });

  it('ignores a later @page that carries no size', () => {
    const html = '<style>@page { size: 58mm auto; }</style><style>@page { margin: 0; }</style>';

    expect(documentWidthMm(html)).toBe(58);
  });

  it.each([
    ['no @page', '<html><body>x</body></html>'],
    ['a size that is not in mm', '<style>@page { size: A4; }</style>'],
    ['a sheet, not a roll', '<style>@page { size: 210mm 297mm; }</style>'],
    ['a page-size property, not size', '<style>@page { page-size: 58mm; }</style>'],
  ])('falls back to 80 for %s', (_case, html) => {
    expect(documentWidthMm(html)).toBe(80);
  });
});

describe('driverPaperMm', () => {
  it.each([
    [{ media: 'oe_roll-80_80x25mm' }, { widthMm: 80, heightMm: 25 }],
    [{ PageSize: 'Custom.80x297mm' }, { widthMm: 80, heightMm: 297 }],
    [{ media: 'Custom.58x0mm' }, { widthMm: 58, heightMm: 0 }],
    [
      { media: 'A4', PageSize: 'Custom.72.5x200mm' },
      { widthMm: 72.5, heightMm: 200 },
    ],
  ])('reads %j', (options, paper) => {
    expect(driverPaperMm(options)).toEqual(paper);
  });

  it.each([
    [{}],
    [null],
    [undefined],
    ['media'],
    [{ media: 'A4' }],
    [{ media: 42 }],
    [{ media: 'Roll Paper 80 x 3276' }],
  ])('says nothing for %j', options => {
    expect(driverPaperMm(options)).toBeNull();
  });
});

describe('driverMediaOptions', () => {
  it('keeps only the paper keys, as the driver wrote them', () => {
    expect(
      driverMediaOptions({ media: 'A4', PageSize: 'Letter', 'printer-location': 'Caixa', system_driverinfo: 'x' })
    ).toEqual({ media: 'A4', PageSize: 'Letter' });
  });

  it('is null when the driver exposes no paper', () => {
    expect(driverMediaOptions({ 'printer-location': 'Caixa' })).toBeNull();
    expect(driverMediaOptions(undefined)).toBeNull();
  });
});
