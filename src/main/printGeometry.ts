import type { Margins } from 'electron';

// The one place that decides the geometry of a print (spec 95, RN-09; spec 89, RN-01): printReceipt is the
// only webContents.print of this repo and the only caller of resolvePrintGeometry. Three cases:
//
// - No useful width saved for the target printer: 'printableArea', nothing forced (spec 95, RN-04).
//   The content box is the area the driver declares, and the delivery-api's relative container shrinks into
//   it. Only as good as what the driver declares: a generic thermal driver that declares the whole roll makes
//   it the same as 'none', and the receipt is cut on the right (spec 89, RN-03).
// - A useful width W measured by the operator (spec 95, RN-05): explicit geometry. A W-wide custom page with
//   zero margins takes the driver out of the account, and an injected `body > * { max-width: W }` shrinks the
//   rectangle the API's document is laid out in — that is what guarantees the result, since a driver may refuse
//   a custom paper and fall back to its default one. The child of <body> is the API's padding div in both of its
//   layouts, with `* { box-sizing: border-box }` (measured in the delivery-api, spec 95 "Contexto"). !important
//   because the block is injected before the API's own <style>s (RN-10) and would lose to them by order.
//   No scaleFactor: the font size the store chose stays (RN-06). The injected @page says the same size as the
//   pageSize option, in a form the `size` grammar accepts (`<length> auto`, the API's own form, is not one).
// - No useful width, but the driver exposes a roll paper that cannot hold a receipt (narrower than 40 mm,
//   shorter than 50 mm, or 0 tall — "80 x 0", "Receipt 80 x 25"): 'printableArea' would lay the receipt out in
//   a box a few millimetres tall and the printer would cut a blank strip (RN-07). The page is forced to the
//   document's own width, 297 mm tall. Best effort: whether Chromium puts the paper in the options map on
//   Windows is not measurable from this repo (on CUPS it carries the destination options); when it does not,
//   the way out of the blank strip is saving a useful width.
//
// Margins in 'custom' are pixels (Electron's Margins); pageSize is microns, at least 353 each way.

export type GeometryReason = 'printable-area' | 'useful-width' | 'invalid-driver-paper';

export type PageSizeMicrons = { width: number; height: number };

export type PrintGeometry = {
  margins: Margins;
  // Absent means "the driver's paper": nothing forced.
  pageSize?: PageSizeMicrons;
  // The CSS to inject after <html>, or null when nothing is injected.
  widthCss: string | null;
  reason: GeometryReason;
};

export type DriverPaper = { widthMm: number; heightMm: number };

// The height of a forced roll page. A continuous roll has no sheet to fill, but Chromium still paginates at this
// height: a receipt longer than 297 mm comes out as two pages, which a driver set to "cut per page" cuts in two.
// 297 mm is the default paper of most thermal drivers of the fleet ("80 x 297"), so for them nothing changes;
// a driver whose default is a long roll ("80 x 3276") would. Measured on the PDV, not here (spec 95, plan).
export const ROLL_PAGE_HEIGHT_MICRONS = 297_000;

const MIN_DRIVER_PAPER_WIDTH_MM = 40;
const MIN_DRIVER_PAPER_HEIGHT_MM = 50;
const MAX_ROLL_WIDTH_MM = 80;

function zeroMargins(): Margins {
  return { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 };
}

function rollPage(widthMm: number): PageSizeMicrons {
  return { width: Math.round(widthMm * 1000), height: ROLL_PAGE_HEIGHT_MICRONS };
}

function usefulWidthCss(widthMm: number): string {
  return (
    `@page { size: ${widthMm}mm ${ROLL_PAGE_HEIGHT_MICRONS / 1000}mm !important; margin: 0 !important; } ` +
    `body > * { max-width: ${widthMm}mm !important; }`
  );
}

function isInvalidDriverPaper({ widthMm, heightMm }: DriverPaper): boolean {
  return widthMm < MIN_DRIVER_PAPER_WIDTH_MM || heightMm < MIN_DRIVER_PAPER_HEIGHT_MM;
}

export function resolvePrintGeometry(input: {
  usefulWidthMm: number | null;
  driverPaper: DriverPaper | null;
  documentWidthMm: number;
}): PrintGeometry {
  if (input.usefulWidthMm !== null) {
    return {
      reason: 'useful-width',
      margins: zeroMargins(),
      pageSize: rollPage(input.usefulWidthMm),
      widthCss: usefulWidthCss(input.usefulWidthMm),
    };
  }

  if (input.driverPaper !== null && isInvalidDriverPaper(input.driverPaper)) {
    return {
      reason: 'invalid-driver-paper',
      margins: zeroMargins(),
      pageSize: rollPage(input.documentWidthMm),
      widthCss: null,
    };
  }

  return { reason: 'printable-area', margins: { marginType: 'printableArea' }, widthCss: null };
}

// The width the document was laid out for: the LAST `size: <n>mm` of an @page block, because the API's
// `original` layout declares the 80mm of its static CSS first and overrides it after. The API lays out between
// 48 and 80 (ReceiptLayoutService, in the delivery-api); the floor here is 40, the width under which a forced
// page would itself be an invalid paper. Anything unreadable or outside 40–80 is 80.
export function documentWidthMm(html: string): number {
  let width: number | null = null;

  for (const block of html.matchAll(/@page\s*\{([^}]*)\}/gi)) {
    const size = /(?:^|[;\s])size\s*:\s*(\d+(?:\.\d+)?)mm\b/i.exec(block[1]);

    if (size) {
      width = Number(size[1]);
    }
  }

  return width !== null && width >= MIN_DRIVER_PAPER_WIDTH_MM && width <= MAX_ROLL_WIDTH_MM ? width : MAX_ROLL_WIDTH_MM;
}

const PAPER_OPTION_KEYS = ['media', 'PageSize'] as const;

// The raw paper values the driver exposes, for the log: it is what tells support, from a PDV, whether the
// options map carries the paper at all (RN-07, RN-08). null when it carries none.
export function driverMediaOptions(options: unknown): Record<string, string> | null {
  if (typeof options !== 'object' || options === null) {
    return null;
  }

  const found: Record<string, string> = {};

  for (const key of PAPER_OPTION_KEYS) {
    const value = (options as Record<string, unknown>)[key];

    if (typeof value === 'string') {
      found[key] = value;
    }
  }

  return Object.keys(found).length > 0 ? found : null;
}

// A size in millimetres written as <w>x<h>mm, the form of the self-describing PWG media names
// (`oe_roll-80_80x297mm`) and of the CUPS custom size (`Custom.80x25mm`). Anything else is null: a name like
// "A4" or "Roll Paper 80 x 3276" says nothing this function can trust.
export function driverPaperMm(options: unknown): DriverPaper | null {
  const media = driverMediaOptions(options);

  if (media === null) {
    return null;
  }

  for (const key of PAPER_OPTION_KEYS) {
    const value = media[key];
    const size = value === undefined ? null : /(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm\b/i.exec(value);

    if (size) {
      return { widthMm: Number(size[1]), heightMm: Number(size[2]) };
    }
  }

  return null;
}
