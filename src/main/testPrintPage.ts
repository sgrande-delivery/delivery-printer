import type { TestPrintRequest } from 'shared/printQueue';

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
function normalizePaperWidth(paperWidth: number): 58 | 80 {
  return paperWidth === 58 ? 58 : 80;
}

export const TEST_PRINT_LABEL = 'a página de teste';

export function buildTestPrintPage(request: TestPrintRequest, appVersion: string, now: Date): string {
  const width = normalizePaperWidth(request.paperWidth);
  const device = request.deviceName === null ? 'padrão do Windows' : request.deviceName;
  const when = now.toLocaleString('pt-BR');

  // The frame and the ruler are what reveal a wrong width or margin. The frame is inset
  // by 2mm on purpose: thermal drivers commonly reserve a couple of non-printable
  // millimetres at each edge, so a frame drawn flush to the paper would lose its side
  // borders on a correctly configured printer — a diagnostic that cries wolf about the
  // right printer is worse than none, because it sends the operator chasing the wrong
  // thing. The inset keeps the signal that matters (a page built for 80mm on 58mm paper
  // still overflows and cuts) and drops the false alarm. The measured precedent for
  // `@page { size: Xmm auto; margin: 0 }` is the delivery-api receipt, which prints this
  // way in every restaurant today.
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  @page { size: ${width}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { width: ${width}mm; font-family: monospace; font-size: 12px; color: #000; }
  .frame { box-sizing: border-box; width: calc(${width}mm - 4mm); margin: 2mm; border: 2px solid #000; padding: 6px; }
  h1 { font-size: 15px; margin: 0 0 6px; text-align: center; }
  p { margin: 2px 0; word-break: break-word; }
  .ruler { margin-top: 8px; border-top: 1px dashed #000; padding-top: 4px; overflow: hidden; white-space: nowrap; }
</style>
</head>
<body>
<div class="frame">
  <h1>TESTE DE IMPRESSÃO</h1>
  <p>Cadastro: ${escapeHtml(request.printerName)}</p>
  <p>Setor: ${escapeHtml(request.stationLabel)}</p>
  <p>Impressora: ${escapeHtml(device)}</p>
  <p>Papel: ${width} mm</p>
  <p>Data: ${escapeHtml(when)}</p>
  <p>Versão: ${escapeHtml(appVersion)}</p>
  <div class="ruler">|&lt;-- ${width} mm --&gt;|</div>
  <div class="ruler">1234567890123456789012345678901234567890</div>
  <p>A moldura e a régua devem caber no papel sem cortar. Se a régua sai cortada ou quebra em duas linhas, a largura configurada não é a do papel.</p>
</div>
</body>
</html>`;
}
