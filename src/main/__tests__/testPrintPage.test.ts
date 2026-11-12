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

    expect(narrow).toContain('max-width: 58mm');
    expect(wide).toContain('max-width: 80mm');
    expect(narrow).not.toEqual(wide);
  });

  it('falls back to 80 mm for a width that is not one of the two', () => {
    expect(buildTestPrintPage({ ...request, paperWidth: 72 }, '2.7.0', now)).toContain('max-width: 80mm');
  });

  // No DOMParser in this file: tsconfig.node.json has no DOM lib, so it would not compile (TS2304),
  // and giving the node side DOM to read a string is the wrong trade. The page is read as text.
  it('lays out by the printable area: the width is a ceiling and nothing is a fixed measure', () => {
    const html = buildTestPrintPage(request, '2.7.0', now);
    const bodyRule = html.match(/\n\s*body \{[^}]*\}/)?.[0] ?? '';
    const frameRule = html.match(/\n\s*\.frame \{[^}]*\}/)?.[0] ?? '';

    expect(bodyRule).not.toBe('');
    expect(frameRule).not.toBe('');
    expect(bodyRule).not.toMatch(/(^|[^-])width:/);
    expect(frameRule).not.toMatch(/(^|[^-])width:/);
    expect(html).toContain('@page { size: 80mm auto; margin: 0; }');
  });

  it.each([
    [80, 16, '80'],
    [58, 11, '55'],
  ])('draws a millimetre scale of %i mm outside the frame, in %i fixed cells', (paperWidth, cells, last) => {
    const html = buildTestPrintPage({ ...request, paperWidth }, '2.7.0', now);
    const marks = Array.from(html.matchAll(/<div class="cell">(\d+)<\/div>/g), match => match[1]);
    // The frame element, from its opening tag to its own closing one: every line it contains is
    // indented, so the first </div> at column 0 is the frame's. Anything of the scale inside it means
    // the scale would be cut by the frame instead of by the printable edge.
    const frameHtml = html.match(/<div class="frame">[\s\S]*?\n<\/div>/)?.[0] ?? '';

    expect(marks).toHaveLength(cells);
    expect(marks[0]).toBe('5');
    expect(marks[marks.length - 1]).toBe(last);
    expect(html).toContain('<div class="scale-label">Largura impressa (mm):</div>');
    expect(frameHtml).toContain('<h1>');
    expect(frameHtml).not.toContain('class="scale');
    expect(frameHtml).not.toContain('class="cell"');
    // Both halves of a 5 mm cell: the basis, and the border-box that keeps the 1px rule inside it.
    // Content-box cells would be 5mm + 1px each and the last mark would land ~4 mm past its number.
    expect(html).toMatch(/\.cell \{[^}]*flex: 0 0 5mm/);
    expect(html).toMatch(/\.cell \{[^}]*box-sizing: border-box/);
  });

  it('escapes the names it prints', () => {
    const html = buildTestPrintPage({ ...request, printerName: '<script>x</script>' }, '2.7.0', now);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('prints the accents line after the version, with the letters intact', () => {
    const html = buildTestPrintPage(request, '2.7.0', now);

    expect(html).toContain('<p>Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç</p>');
    expect(html).not.toMatch(/&amp;[A-Za-z]+;|&amp;#/);
    expect(html.indexOf('Versão: 2.7.0')).toBeLessThan(html.indexOf('Acentos:'));
  });

  it('keeps the frame, the column ruler, the six data lines and the closing note', () => {
    const html = buildTestPrintPage(request, '2.7.0', now);

    expect(html).toContain('<div class="frame">');
    expect(html).toContain('border: 2px solid #000');
    expect(html.match(/<div class="ruler">/g)).toHaveLength(1);
    expect(html).not.toContain('|&lt;--');
    expect(html).toContain('<div class="ruler">1234567890123456789012345678901234567890</div>');
    expect(html).toContain('<h1>TESTE DE IMPRESSÃO</h1>');

    for (const label of ['Cadastro:', 'Setor:', 'Impressora:', 'Papel:', 'Data:', 'Versão:']) {
      expect(html).toContain(`<p>${label} `);
    }

    expect(html).toContain('A moldura deve sair fechada nos quatro lados');
  });

  it('escapes a name that looks like an entity next to the accents line', () => {
    const html = buildTestPrintPage({ ...request, printerName: 'A&B' }, '2.7.0', now);

    expect(html).toContain('<p>Cadastro: A&amp;B</p>');
    expect(html).toContain('<p>Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç</p>');
  });
});
