import type { App } from 'electron';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { describeError } from 'shared/describeError';
import { getAssetPath } from './asset';
import { logger } from './logger';

export type PrintFontFace = { file: string; family: string; weight: number };

// The family names are a contract with PrintFontEnum::css() in the delivery-api
// (core/Printer/Domain/Enums/PrintFontEnum.php): the API only names the font, and
// a different spelling here means the face never matches, with no error at all.
// Only the weights some view reaches are listed (RN-07): no mono, no 400 for Plex/Barlow.
export const PRINT_FONT_FACES: readonly PrintFontFace[] = [
  { file: 'ibm-plex-sans-condensed-500.woff2', family: 'IBM Plex Sans Condensed', weight: 500 },
  { file: 'ibm-plex-sans-condensed-700.woff2', family: 'IBM Plex Sans Condensed', weight: 700 },
  { file: 'atkinson-hyperlegible-400.woff2', family: 'Atkinson Hyperlegible', weight: 400 },
  { file: 'atkinson-hyperlegible-700.woff2', family: 'Atkinson Hyperlegible', weight: 700 },
  { file: 'barlow-semi-condensed-500.woff2', family: 'Barlow Semi Condensed', weight: 500 },
  { file: 'barlow-semi-condensed-700.woff2', family: 'Barlow Semi Condensed', weight: 700 },
];

// Only @font-face blocks, no rule with a selector: declaring a face never chooses
// a family, so the `original` font stays exactly as it is today (RN-02).
// font-display: block, not swap: swap paints in the fallback and swaps later, and
// on paper there is no later.
export function buildPrintFontFacesCss(resolve: (file: string) => string): string {
  return PRINT_FONT_FACES.map(
    ({ file, family, weight }) =>
      `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: block; ` +
      `src: url('${pathToFileURL(resolve(file)).href}') format('woff2'); }`
  ).join('\n');
}

// The one injection point of the print HTML, for the font faces and for the useful width of the printer
// (spec 95, RN-10). The block goes right after the opening <html> tag, never at
// the start of the string. Anything before <!DOCTYPE html> throws Chromium into
// quirks mode, and quirks mode changes the metrics of the whole document
// (margins, height collapsing, width): on an 80 mm roll that is the receipt
// cropped differently, with no error to explain it. Being first, the block loses
// to the document's own <style>s by order: a rule that must win says !important.
export function withPrintStyle(html: string, css: string): string {
  if (css === '') {
    return html;
  }

  const style = `<style>${css}</style>`;

  const htmlTag = /<html(?:\s[^>]*)?>/i.exec(html);
  if (htmlTag) {
    const at = htmlTag.index + htmlTag[0].length;
    return html.slice(0, at) + style + html.slice(at);
  }

  const bodyTag = /<body(?:\s[^>]*)?>/i.exec(html);
  if (bodyTag) {
    return html.slice(0, bodyTag.index) + style + html.slice(bodyTag.index);
  }

  return html + style;
}

// A missing file still gets its face declared: printing must not stop because
// of a font (RF-04), but the log has to say why the receipt came out in fallback.
export function loadPrintFontFacesCss(app: App): string {
  try {
    const resolve = (file: string): string => getAssetPath(app, 'fonts', file);

    for (const { file } of PRINT_FONT_FACES) {
      if (!fs.existsSync(resolve(file))) {
        logger.warn(`print-fonts: font file missing: ${file}. Documents will print in the fallback font.`);
      }
    }

    return buildPrintFontFacesCss(resolve);
  } catch (err: unknown) {
    // Declaring no face at all is a receipt in the fallback font; throwing is a
    // receipt that never comes out. And since the cache only keeps the success
    // path, an escaping error would come back on every single print, not once.
    logger.warn('print-fonts: could not resolve the font files; printing in the fallback font', describeError(err));

    return '';
  }
}

let cachedCss: string | null = null;

// Built once per process, since the path does not change at runtime. A font added
// while developing only shows up after restarting the app.
export function getPrintFontFacesCss(app: App): string {
  if (cachedCss === null) {
    cachedCss = loadPrintFontFacesCss(app);
  }

  return cachedCss;
}
