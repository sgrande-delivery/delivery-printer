// What the test page says, in one place, because two things must never disagree about it: the page the
// main process prints (src/main/testPrintPage.ts) and the preview the test screen draws. Only the words
// live here; the markup of the page and the look of the preview stay with each side.

export const TEST_PRINT_TITLE = 'TESTE DE IMPRESSÃO';

// Thermal printers with the wrong code page swap an accent for a symbol, and nothing else in the app
// reveals it. Keep every accented letter of Portuguese that a receipt prints in this line.
export const TEST_PRINT_ACCENTS = 'ÁÉÍÓÚ ÂÊÔ ÃÕ Ç';

// Forty columns, ~70 mm at the 12 px monospace the page prints in (spec 89, RN-07) — more than the
// frame leaves inside the ~72 mm a thermal head covers on an 80 mm roll (spec 89, "Contexto": 576 dots
// at 203 dpi), so on a correct printer this line comes out cut. It is a reading scale, not a promise
// to fit: the last visible column is how many characters that printer gives at this font size.
export const TEST_PRINT_COLUMNS = '1234567890123456789012345678901234567890';

// The note points the operator at the scale by the name printed above it, so the title is a constant
// and both uses derive from it. Naming the instrument twice is how the two drift apart, and this file
// exists to stop that.
export const TEST_PRINT_SCALE_TITLE = 'Largura impressa (mm)';

export const TEST_PRINT_SCALE_LABEL = `${TEST_PRINT_SCALE_TITLE}:`;

export const TEST_PRINT_NOTE =
  'A moldura deve sair fechada nos quatro lados. Se faltar um lado, o driver informa uma área imprimível ' +
  `maior do que a impressora alcança. Em "${TEST_PRINT_SCALE_TITLE}", a última marca visível é a largura ` +
  'real. Na régua de números, a última coluna visível indica quantos caracteres cabem.';

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

// What the page says about the geometry it was printed with (spec 95, RN-11), so that support reads on the
// paper which one came out. Outside the frame, next to the scale, which the preview of the test screen does not
// draw: only the paper carries it. Short on purpose: it prints at 9 px and wraps to fit 48 mm.
export type TestPrintGeometry =
  // No useful width saved for the device: the area the driver declares.
  | { kind: 'auto' }
  // No device resolved: the page goes to the system default, whose geometry the screen does not know.
  | { kind: 'default-printer' }
  | { kind: 'useful-width'; widthMm: number }
  // The measuring page: over the whole roll, ignoring any useful width, so the head cuts the scale.
  | { kind: 'measure'; paperWidthMm: 58 | 80 };

export function testPrintGeometryLine(geometry: TestPrintGeometry): string {
  switch (geometry.kind) {
    case 'auto':
      return 'Geometria: automática (área do driver)';
    case 'default-printer':
      return 'Geometria: a da impressora padrão do Windows';
    case 'useful-width':
      return `Geometria: largura útil de ${geometry.widthMm} mm, desta máquina`;
    case 'measure':
      return `Geometria: medição na bobina de ${geometry.paperWidthMm} mm`;
  }
}
