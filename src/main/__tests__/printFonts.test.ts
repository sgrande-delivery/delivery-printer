import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { App } from 'electron';

const mocks = vi.hoisted(() => ({ warn: vi.fn() }));

// electron-log/main needs the real electron, so the logger is replaced here.
vi.mock('../logger', () => ({ logger: { warn: mocks.warn } }));

import { PRINT_FONT_FACES, buildPrintFontFacesCss, loadPrintFontFacesCss, withPrintStyle } from '../printFonts';

const FONTS_DIR = path.resolve(__dirname, '../../../assets/fonts');

const API_HTML =
  '<!DOCTYPE html>\n<html>\n<style>.bold { font-weight: 700; }</style>\n' +
  '<style>@page { margin: 0 } body { font-family: sans-serif; }</style>\n<body><p>Pedido ação</p></body>\n</html>';

const FACES = buildPrintFontFacesCss(file => path.join(FONTS_DIR, file));

describe('PRINT_FONT_FACES', () => {
  it('is the six faces of RN-07, named as the API names them', () => {
    expect(PRINT_FONT_FACES.map(({ family, weight }) => `${family} ${weight}`)).toEqual([
      'IBM Plex Sans Condensed 500',
      'IBM Plex Sans Condensed 700',
      'Atkinson Hyperlegible 400',
      'Atkinson Hyperlegible 700',
      'Barlow Semi Condensed 500',
      'Barlow Semi Condensed 700',
    ]);
  });

  it.each(PRINT_FONT_FACES.map(face => face.file))('has %s on disk in assets/fonts', file => {
    expect(fs.existsSync(path.join(FONTS_DIR, file))).toBe(true);
  });
});

describe('buildPrintFontFacesCss', () => {
  it('declares six faces, each font-display block with a file URL', () => {
    const blocks = FACES.match(/@font-face\s*\{[^}]*\}/g) ?? [];

    expect(blocks).toHaveLength(6);
    for (const block of blocks) {
      expect(block).toContain('font-display: block');
      expect(block).toMatch(/url\('file:\/\/[^']+'\)/);
    }
  });

  it('pairs family and weight in each generated block, in order (RN-07)', () => {
    const blocks = FACES.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    const pairs = blocks.map(block => {
      const family = /font-family:\s*'([^']+)'/.exec(block)?.[1];
      const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];

      return `${family} ${weight}`;
    });

    expect(pairs).toEqual([
      'IBM Plex Sans Condensed 500',
      'IBM Plex Sans Condensed 700',
      'Atkinson Hyperlegible 400',
      'Atkinson Hyperlegible 700',
      'Barlow Semi Condensed 500',
      'Barlow Semi Condensed 700',
    ]);
  });

  it('percent-encodes a path with space and accent (RN-06)', () => {
    const css = buildPrintFontFacesCss(() => '/opt/Program Files/SGrande Impressão/x.woff2');

    // Asserted by property, not by literal path: on Windows pathToFileURL resolves a drive-less
    // path against the current drive, so `/opt/x` comes out as `file:///D:/opt/x`, and the
    // full-string assertion broke the publish workflow (windows-latest) on v3.0.0. Both halves
    // of RN-06 stay covered: the percent-encoding, and the `file:///` form that concatenating a
    // Windows path by hand would not produce (`file://D:/...` is not a valid URL).
    expect(css).toContain('Program%20Files/SGrande%20Impress%C3%A3o/x.woff2');
    expect(css).toContain("src: url('file:///");
    expect(css).not.toContain('Impressão');
    expect(css).not.toContain(' Files');
  });

  it('only declares faces: nothing is left once they are removed (RN-02)', () => {
    expect(FACES.replace(/@font-face\s*\{[^}]*\}/g, '').trim()).toBe('');
  });
});

describe('withPrintStyle', () => {
  it('keeps the doctype first and puts the block right after <html> (RN-05)', () => {
    const result = withPrintStyle(API_HTML, FACES);

    expect(result.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result.indexOf('<style>@font-face')).toBe(result.indexOf('<html>') + '<html>'.length);
  });

  it.each(['<html lang="pt-BR">', '<HTML>', '<HTML LANG="pt-BR">'])(
    'puts the block right after an opening %s, doctype first (RN-05)',
    openTag => {
      const html = `<!DOCTYPE html>\n${openTag}<head></head><body>x</body></html>`;
      const result = withPrintStyle(html, FACES);

      expect(result.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(result.indexOf('<style>@font-face')).toBe(result.indexOf(openTag) + openTag.length);
      expect(result.indexOf('<style>@font-face')).toBeLessThan(result.indexOf('<body>'));
      expect(result.replace(`<style>${FACES}</style>`, '')).toBe(html);
    }
  );

  it('is additive: the original HTML stays whole', () => {
    const result = withPrintStyle(API_HTML, FACES);

    expect(result.replace(`<style>${FACES}</style>`, '')).toBe(API_HTML);
  });

  it('enters before <body> when there is no <html>, doctype still first', () => {
    const html = '<!DOCTYPE html>\n<style>a{}</style><body>x</body>';
    const result = withPrintStyle(html, FACES);

    expect(result.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result.indexOf('<style>@font-face')).toBe(result.indexOf('<body>') - `<style>${FACES}</style>`.length);
    expect(result.replace(`<style>${FACES}</style>`, '')).toBe(html);
  });

  it('appends at the end when there is neither <html> nor <body>', () => {
    const html = '<!DOCTYPE html>\n<p>x</p>';
    const result = withPrintStyle(html, FACES);

    expect(result.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(result).toBe(`${html}<style>${FACES}</style>`);
  });

  // The fonts failed (the cache holds '') and no useful width applies: the document goes out as the API sent it.
  it('injects nothing when there is no css', () => {
    expect(withPrintStyle(API_HTML, '')).toBe(API_HTML);
  });
});

describe('loadPrintFontFacesCss', () => {
  const app = { isPackaged: false, getPath: () => '' } as unknown as App;

  beforeEach(() => {
    mocks.warn.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not warn when every file exists', () => {
    loadPrintFontFacesCss(app);

    expect(mocks.warn).not.toHaveBeenCalled();
  });

  // A blindagem nasceu do review e e a invariante mais caríssima da spec: impressao
  // nao para por causa de fonte. O getter que lanca e a borda honesta, porque
  // getAssetPath le app.isPackaged (asset.ts:5) - o throw nasce onde nasceria de verdade.
  it('returns no css instead of throwing when the path cannot be resolved (RF-04)', () => {
    const broken = {
      get isPackaged(): boolean {
        throw new Error('resourcesPath unavailable');
      },
    } as unknown as App;

    expect(loadPrintFontFacesCss(broken)).toBe('');
    expect(mocks.warn).toHaveBeenCalledTimes(1);
  });

  it('warns once naming the missing file and still declares the six faces (RN-08)', () => {
    const real = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation(
      p => !String(p).endsWith('barlow-semi-condensed-700.woff2') && real(p)
    );

    const css = loadPrintFontFacesCss(app);

    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn.mock.calls[0][0]).toContain('barlow-semi-condensed-700.woff2');
    expect(css.match(/@font-face/g)).toHaveLength(6);
  });

  it('warns once per process across calls and returns the same css (RN-08)', async () => {
    vi.resetModules();
    const fonts = await import('../printFonts');
    const real = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation(
      p => !String(p).endsWith('barlow-semi-condensed-700.woff2') && real(p)
    );

    const first = fonts.getPrintFontFacesCss(app);
    const second = fonts.getPrintFontFacesCss(app);

    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.match(/@font-face/g)).toHaveLength(6);
  });
});
