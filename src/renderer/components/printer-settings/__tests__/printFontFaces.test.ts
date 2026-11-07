import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_OPTIONS } from '../printDocuments';

const RENDERER_DIR = path.resolve(__dirname, '../../..');
const APP_CSS = path.join(RENDERER_DIR, 'app.css');

type Face = { family: string; weight: number; src: string };

function readFaces(): Face[] {
  const css = fs.readFileSync(APP_CSS, 'utf8');
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

  return blocks.map((block): Face => {
    const family = /font-family:\s*'([^']*)'/.exec(block)?.[1] ?? '';
    const weight = Number(/font-weight:\s*(\d+)\s*;/.exec(block)?.[1]);
    const src = /url\('([^']*)'\)/.exec(block)?.[1] ?? '';
    return { family, weight, src };
  });
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name));
}

const withFace = FONT_OPTIONS.filter(option => option.fontFamily !== undefined);

describe('print font faces in the renderer', () => {
  // The 3 is pinned on purpose (spec 56, RN-07): one face per family, because the only consumer here
  // is the label. A 4 does not mean "the test is stale", it means a font was added to the API's enum
  // and its face has yet to be declared.
  it('has an option with a face for each of the three families', () => {
    expect(withFace).toHaveLength(3);
  });

  it.each(withFace.map(option => [option.fontFamily, option.fontWeight]))(
    'declares an @font-face for "%s" at weight %s, with the exact spelling',
    (family, weight) => {
      const match = readFaces().filter(face => face.family === family && face.weight === weight);

      expect(match).toHaveLength(1);
    }
  );

  it('points every declared print face at a file that exists', () => {
    const families = new Set(withFace.map(option => option.fontFamily));
    const faces = readFaces().filter(face => families.has(face.family));

    expect(faces).toHaveLength(3);
    for (const face of faces) {
      expect(fs.existsSync(path.resolve(path.dirname(APP_CSS), face.src)), face.src).toBe(true);
      // The file name carries the weight (assets/fonts/README.md), and a face declared 500 pointing
      // at the 700 file is invisible on screen: both faces of the family end up identical in
      // family+weight+style, and the bold file serves the body text.
      expect(face.src.endsWith(`-${face.weight}.woff2`), face.src).toBe(true);
    }
  });

  it('leaves the original option without a face of its own', () => {
    const original = FONT_OPTIONS.find(option => option.value === 'original');

    expect(original).toBeDefined();
    expect(original?.fontFamily).toBeUndefined();
    expect(readFaces().filter(face => face.family === 'original')).toHaveLength(0);
  });

  // .md stays out: src/renderer/fonts/README.md holds the Google Fonts URL on purpose, as the recipe
  // for regenerating the icon subset. This file excludes itself because it contains the literal —
  // and if it is ever renamed, the exclusion stops matching and the test fails loudly.
  it('never reaches for Google Fonts (RN-08)', () => {
    const offenders = listFiles(RENDERER_DIR)
      .filter(file => !file.endsWith('printFontFaces.test.ts') && /\.(css|tsx?|html|svg)$/.test(file))
      .filter(file => fs.readFileSync(file, 'utf8').includes('fonts.googleapis.com'));

    expect(offenders).toEqual([]);
  });
});
