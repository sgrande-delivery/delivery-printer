import type { TestPrintRequest } from 'shared/printQueue';
import {
  TEST_PRINT_COLUMNS,
  TEST_PRINT_NOTE,
  TEST_PRINT_SCALE_LABEL,
  TEST_PRINT_TITLE,
  testPrintDataLines,
  testPrintGeometryLine,
  type TestPrintGeometry,
} from 'shared/testPrintContent';

// This is the one print layout that lives in this repo, and it is an exception on
// purpose: every receipt is rendered by the delivery-api and must stay there (see
// CLAUDE.md). This page is not a receipt, it is a diagnostic. What makes it the
// exception is also the limit of the exception: it must carry no order and no
// customer data, ever, and it has to come out with the API down (that is the
// installation scenario), which is why the route that would serve it (POST
// /printers/{id}/test-print, delivery-api#1205) would not do. It is an HTML string
// in the main process, not a React component, so it does not become a pretext to
// bring print layout back. A second layout here is not this exception extended: it
// is what this comment exists to refuse. Anything with order data goes to the API,
// even when building it here would be quicker.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ESCAPES[char]);
}

// paper_width is an enum of two cases in the delivery-api, but it arrives here as a
// number read from the record: anything else is laid out as the wider roll.
export function normalizePaperWidth(paperWidth: number): 58 | 80 {
  return paperWidth === 58 ? 58 : 80;
}

export const TEST_PRINT_LABEL = 'a página de teste';

export const TEST_MEASURE_LABEL = 'a página de medição';

export function buildTestPrintPage(
  request: TestPrintRequest,
  appVersion: string,
  now: Date,
  geometry: TestPrintGeometry = { kind: 'auto' }
): string {
  const width = normalizePaperWidth(request.paperWidth);
  const lines = testPrintDataLines({
    printerName: request.printerName,
    stationLabel: request.stationLabel,
    deviceName: request.deviceName,
    paperWidth: width,
    when: now.toLocaleString('pt-BR'),
    appVersion,
  });

  // The content box of this page is the printable area the driver declares (marginType 'printableArea',
  // see onRawPrint.ts) — on an 80mm roll, the ~72mm the head covers (spec 89, "Contexto": 576 dots at
  // 203 dpi). Hence a ceiling and not a measure: fixed millimetres overflow it and cut the frame on the
  // very printer where the receipt just came out right. What the frame reports changed with that: not
  // whether the configured width matches the paper, but whether the driver told the truth — a missing
  // border means it declared more than the head reaches. The 2mm inset stays for the old reason: a
  // driver that reserves a millimetre or two should not cost the frame its side borders. The @page rule
  // stays too — its `size` is what tells the 58mm roll from the 80mm one, and its `margin: 0` is the
  // delivery-api receipt's own precedent, ignored while marginType is not 'default' (spec 89, RN-02).
  //
  // The scale is the one thing that must NOT adapt (spec 89, RN-06): fixed millimetres, sibling of the
  // frame, flush to the left edge of the content box. It exists to be cut by the printable edge, and
  // that cut is the number the operator reads — inset it reads shifted, nested the frame cuts it first.
  //
  // With a useful width W saved for the printer (spec 95, RN-11) the print is a W-wide page and the frame gets
  // a ceiling of its own, border-box, so it closes inside W even when the driver refuses the custom paper and
  // the page falls back to 80mm. The ceiling is !important because printReceipt injects
  // `body > * { max-width: Wmm !important }` for the same print, and the frame is a child of <body>: an
  // important rule beats a normal one whatever the specificity, which would leave the frame W wide plus its
  // 2mm margin. Both important, `.frame` (0,1,0) wins over `body > *` (0,0,1). The scale still does not adapt,
  // and on a W-wide page it ends at the mark of W: what this page confirms then is the closed frame. Measuring
  // is the other mode, 'measure': the print ignores the saved width and lays the page over the whole roll, so
  // the head — not the app — cuts the scale.
  const frameCeiling =
    geometry.kind === 'useful-width'
      ? `\n  .frame { box-sizing: border-box; max-width: calc(${geometry.widthMm}mm - 4mm) !important; }`
      : '';
  const scaleCells = Array.from(
    { length: Math.floor(width / 5) },
    (_, index) => `<div class="cell">${(index + 1) * 5}</div>`
  );

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  @page { size: ${width}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { max-width: ${width}mm; font-family: monospace; font-size: 12px; color: #000; }
  .frame { margin: 2mm; border: 2px solid #000; padding: 6px; }${frameCeiling}
  h1 { font-size: 15px; margin: 0 0 6px; text-align: center; }
  p { margin: 2px 0; word-break: break-word; }
  .ruler { margin-top: 8px; border-top: 1px dashed #000; padding-top: 4px; overflow: hidden; white-space: nowrap; }
  .geometry { font-size: 9px; margin: 0 0 2px; word-break: break-word; }
  .scale-label { font-size: 9px; white-space: nowrap; overflow: hidden; }
  .scale { display: flex; overflow: hidden; }
  .cell { flex: 0 0 5mm; box-sizing: border-box; border-right: 1px solid #000; font-size: 9px; line-height: 1.4; text-align: right; padding-right: 1px; white-space: nowrap; overflow: hidden; }
</style>
</head>
<body>
<div class="frame">
  <h1>${escapeHtml(TEST_PRINT_TITLE)}</h1>
${lines.map(line => `  <p>${escapeHtml(line)}</p>`).join('\n')}
  <div class="ruler">${escapeHtml(TEST_PRINT_COLUMNS)}</div>
  <p>${escapeHtml(TEST_PRINT_NOTE)}</p>
</div>
<div class="geometry">${escapeHtml(testPrintGeometryLine(geometry))}</div>
<div class="scale-label">${escapeHtml(TEST_PRINT_SCALE_LABEL)}</div>
<div class="scale">${scaleCells.join('')}</div>
</body>
</html>`;
}
