// What the test page says, in one place, because two things must never disagree about it: the page the
// main process prints (src/main/testPrintPage.ts) and the preview the test screen draws. Only the words
// live here; the markup of the page and the look of the preview stay with each side.

export const TEST_PRINT_TITLE = 'TESTE DE IMPRESSÃO';

// Thermal printers with the wrong code page swap an accent for a symbol, and nothing else in the app
// reveals it. Keep every accented letter of Portuguese that a receipt prints in this line.
export const TEST_PRINT_ACCENTS = 'ÁÉÍÓÚ ÂÊÔ ÃÕ Ç';

// Forty columns, the width of a roll of 80 mm in the default font: a page that breaks this line is
// laid out wider than the paper.
export const TEST_PRINT_COLUMNS = '1234567890123456789012345678901234567890';

export const TEST_PRINT_NOTE =
  'A moldura e a régua devem caber no papel sem cortar. Se a régua sai cortada ou quebra em duas linhas, a largura configurada não é a do papel.';

export interface TestPrintFields {
  printerName: string;
  stationLabel: string;
  // The Windows device the page goes to, or null for the default one.
  deviceName: string | null;
  paperWidth: 58 | 80;
  when: string;
  appVersion: string;
}

export function testPrintDataLines(fields: TestPrintFields): string[] {
  return [
    `Cadastro: ${fields.printerName}`,
    `Setor: ${fields.stationLabel}`,
    `Impressora: ${fields.deviceName === null ? 'padrão do Windows' : fields.deviceName}`,
    `Papel: ${fields.paperWidth} mm`,
    `Data: ${fields.when}`,
    `Versão: ${fields.appVersion}`,
    `Acentos: ${TEST_PRINT_ACCENTS}`,
  ];
}

export function testPrintWidthRuler(paperWidth: number): string {
  return `|<-- ${paperWidth} mm -->|`;
}
