import { describe, expect, it } from 'vitest';
import type { PrinterSettingsData } from 'renderer/services/printerSettings';
import {
  DOCUMENT_MODEL_OPTIONS,
  FONT_OPTIONS,
  resolveDocumentModel,
  resolveFontKey,
  type PrintDocumentModel,
  type PrintFontKey,
} from '../printDocuments';

const MODELS: PrintDocumentModel[] = ['original', 'completo', 'simples'];
const FONTS: PrintFontKey[] = ['original', 'plex', 'atkinson', 'barlow'];
const INVALID: unknown[] = [undefined, null, 3, {}, [], '', 'foo', 'Completo', 'toString'];

describe('option tables', () => {
  it('have exactly one entry per enum member, original first', () => {
    expect(DOCUMENT_MODEL_OPTIONS.map(option => option.value)).toEqual(MODELS);
    expect(FONT_OPTIONS.map(option => option.value)).toEqual(FONTS);
  });

  it('carry the names and descriptions of the admin panel', () => {
    expect(DOCUMENT_MODEL_OPTIONS.map(({ name, description }) => [name, description])).toEqual([
      ['Original', 'Igual ao que imprime hoje'],
      ['Completo', 'Seções, linhas e destaques para leitura rápida'],
      ['Simples', 'Só o essencial, usa menos papel'],
    ]);
    expect(FONT_OPTIONS.map(({ name, description }) => [name, description])).toEqual([
      ['Original', 'Fonte do sistema, como hoje'],
      ['IBM Plex Sans Condensed', 'Estreita, cabe mais por linha'],
      ['Atkinson Hyperlegible', 'Máxima legibilidade, mais larga'],
      ['Barlow Semi Condensed', 'Meio-termo, traço uniforme'],
    ]);
  });

  it('gives each family a face and the receipt body weight, and gives `original` none', () => {
    const byValue = Object.fromEntries(FONT_OPTIONS.map(option => [option.value, option]));

    expect(byValue.original.fontFamily).toBeUndefined();
    expect(byValue.original.fontWeight).toBeUndefined();
    expect([byValue.plex, byValue.atkinson, byValue.barlow].map(o => [o.fontFamily, o.fontWeight])).toEqual([
      ['IBM Plex Sans Condensed', 500],
      ['Atkinson Hyperlegible', 400],
      ['Barlow Semi Condensed', 500],
    ]);
  });
});

describe('resolveDocumentModel', () => {
  it.each(MODELS)('returns %s as is', value => {
    expect(resolveDocumentModel({ document_model: value })).toBe(value);
  });

  it.each(INVALID)('resolves %j to original', value => {
    expect(resolveDocumentModel({ document_model: value } as PrinterSettingsData)).toBe('original');
  });

  it('resolves an absent key to original', () => {
    expect(resolveDocumentModel({})).toBe('original');
  });
});

describe('resolveFontKey', () => {
  it.each(FONTS)('returns %s as is', value => {
    expect(resolveFontKey({ font_family: value })).toBe(value);
  });

  it.each(INVALID)('resolves %j to original', value => {
    expect(resolveFontKey({ font_family: value } as PrinterSettingsData)).toBe('original');
  });

  it('resolves an absent key to original', () => {
    expect(resolveFontKey({})).toBe('original');
  });
});
