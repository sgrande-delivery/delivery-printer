import type { PrinterSettingsData } from 'renderer/services/printerSettings';

// This is the SECOND copy of an enum owned by the delivery-api (PrintFontEnum, PrintDocumentModel),
// after the delivery-admin's. A value added there and not here DISAPPEARS from the selector in
// silence: the screen shows no option it does not know, while the value saved by the other end
// keeps working. Whoever adds a model or a font in the API has to open an issue here.
//
// `fontFamily` is the glue with the @font-face of app.css (the label is written in its own face):
// one letter apart and the label falls back with no error. It is NOT the list of
// src/main/printFonts.ts, which serves the printed document and is a contract with the API.

export type PrintDocumentModel = 'original' | 'completo' | 'simples';
export type PrintFontKey = 'original' | 'plex' | 'atkinson' | 'barlow';

export interface DocumentModelOption {
  value: PrintDocumentModel;
  name: string;
  description: string;
}

export interface FontOption {
  value: PrintFontKey;
  name: string;
  description: string;
  // Absent in `original`: it is the interface font, and drawing it in any family would lie about it.
  fontFamily?: string;
  fontWeight?: number;
}

// Table order is the order of the cards and the order the arrow keys walk. `original` first.
export const DOCUMENT_MODEL_OPTIONS: readonly DocumentModelOption[] = [
  { value: 'original', name: 'Original', description: 'Igual ao que imprime hoje' },
  { value: 'completo', name: 'Completo', description: 'Seções, linhas e destaques para leitura rápida' },
  { value: 'simples', name: 'Simples', description: 'Só o essencial, usa menos papel' },
];

// Weights are the receipt body's (PrintFontEnum::weight() in the API), the stroke the operator reads on the roll.
export const FONT_OPTIONS: readonly FontOption[] = [
  { value: 'original', name: 'Original', description: 'Fonte do sistema, como hoje' },
  {
    value: 'plex',
    name: 'IBM Plex Sans Condensed',
    description: 'Estreita, cabe mais por linha',
    fontFamily: 'IBM Plex Sans Condensed',
    fontWeight: 500,
  },
  {
    value: 'atkinson',
    name: 'Atkinson Hyperlegible',
    description: 'Máxima legibilidade, mais larga',
    fontFamily: 'Atkinson Hyperlegible',
    fontWeight: 400,
  },
  {
    value: 'barlow',
    name: 'Barlow Semi Condensed',
    description: 'Meio-termo, traço uniforme',
    fontFamily: 'Barlow Semi Condensed',
    fontWeight: 500,
  },
];

// Absent (no migration, no seeder: every store today), a wrong type and a string outside the enum
// (the PUT has no FormRequest) all mean `original`, as in the panel and in the API views.
function resolveOption<T extends string>(options: readonly { value: T }[], raw: unknown, fallback: T): T {
  const match = options.find(option => option.value === raw);

  return match ? match.value : fallback;
}

export function resolveDocumentModel(settings: PrinterSettingsData): PrintDocumentModel {
  return resolveOption(DOCUMENT_MODEL_OPTIONS, settings.document_model, 'original');
}

export function resolveFontKey(settings: PrinterSettingsData): PrintFontKey {
  return resolveOption(FONT_OPTIONS, settings.font_family, 'original');
}
