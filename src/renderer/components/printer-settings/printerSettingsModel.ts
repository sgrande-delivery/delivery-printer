import type { PrinterSetting } from 'renderer/types/restaurant';
import type { PrinterSettingsData } from 'renderer/services/printerSettings';

export type StepKey = 'font_size' | 'production_template_copies' | 'shipment_template_copies' | 'margin_size';

// What the operator has touched and not saved yet. A key is here only while it differs from the baseline.
export type Draft = Partial<Pick<PrinterSetting, StepKey | 'no_margin'>>;

// The closed sets of the admin panel (delivery-admin, pages/printer-settings/PrinterSettingsForm.tsx).
// The delivery-api validates nothing on PUT /printerSettings (no FormRequest; the use case stores
// whatever keys come), so these sets are the only guard against font 0 (blank receipt) and 0 copies
// (no receipt). The design's 9-18 / 1-5 / 0-10 mm ranges are not used: see divergence 6 of the spec.
export const CLOSED_SETS: Record<StepKey, readonly number[]> = {
  font_size: [12, 14, 16, 18, 20, 22, 24],
  production_template_copies: [1, 2, 3, 4],
  shipment_template_copies: [1, 2, 3, 4],
  // In px (the receipt's padding is `margin_size px`). The panel's "0px" is the stored value 1.
  margin_size: [1, 10, 15, 20, 25, 30, 35, 40],
};

export interface StepOption {
  value: number;
  label: string;
}

export function readNumber(settings: PrinterSettingsData, key: StepKey): number | undefined {
  const value = settings[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function optionLabel(key: StepKey, value: number): string {
  if (key === 'font_size') {
    return `${value} px`;
  }

  if (key === 'margin_size') {
    // 1 is the panel's "0px": a real stored value, shown as what it does.
    return `${value === 1 ? 0 : value} px`;
  }

  return String(value);
}

// The closed set plus whatever the server already holds. A stored 13 stays reachable (and
// restorable by "Descartar") instead of being rewritten the moment the screen opens.
export function stepOptions(key: StepKey, stored: number | undefined): StepOption[] {
  const values = new Set<number>(CLOSED_SETS[key]);

  if (stored !== undefined) {
    values.add(stored);
  }

  return [...values].sort((a, b) => a - b).map(value => ({ value, label: optionLabel(key, value) }));
}

export function currentValue(settings: PrinterSettingsData, draft: Draft, key: StepKey): number | undefined {
  return draft[key] ?? readNumber(settings, key);
}

export function currentNoMargin(settings: PrinterSettingsData, draft: Draft): boolean {
  return draft.no_margin ?? settings.no_margin === true;
}

// Only the keys that differ from the baseline. Going back to the stored value leaves the draft clean.
export function diffChanges(settings: PrinterSettingsData, draft: Draft): Partial<PrinterSetting> {
  const changes: Partial<PrinterSetting> = {};

  for (const key of Object.keys(CLOSED_SETS) as StepKey[]) {
    const next = draft[key];

    if (next !== undefined && next !== readNumber(settings, key)) {
      changes[key] = next;
    }
  }

  if (draft.no_margin !== undefined && draft.no_margin !== (settings.no_margin === true)) {
    changes.no_margin = draft.no_margin;
  }

  return changes;
}

export function isDirty(settings: PrinterSettingsData, draft: Draft): boolean {
  return Object.keys(diffChanges(settings, draft)).length > 0;
}

export function marginHint(noMargin: boolean): string {
  return noMargin ? 'Desligada por "Sem margem"' : 'Em pixels';
}

export interface PreviewMetrics {
  width: number;
  fontSize: number;
  // top, sides and bottom, as the shorthand `padding` takes it.
  padding: string;
}

export const DEFAULT_MAX_WIDTH_MM = 80;
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_MARGIN = 15;
// printer-v2.dc.html:741 — the paper is `max_width * 3.2` px wide.
const PX_PER_MM = 3.2;
// The receipt pads `margin_size` CSS px; the preview paper is 3.2 px/mm against the real 3.78,
// so the same padding is drawn at 3.2 / 3.78 of its size to keep the proportion to the width.
const MARGIN_SCALE = 0.85;
// The bottom of the paper is 22 px whatever the margin, so the scalloped edge does not cut text (:741).
const PAPER_BOTTOM = 22;

// An illustration of what the values do, never the receipt (RN-07). `max_width` is read, not edited:
// the admin panel does not edit it either.
export function previewMetrics(settings: PrinterSettingsData, draft: Draft): PreviewMetrics {
  const maxWidth =
    typeof settings.max_width === 'number' && settings.max_width > 0 ? settings.max_width : DEFAULT_MAX_WIDTH_MM;
  const margin = currentValue(settings, draft, 'margin_size') ?? DEFAULT_MARGIN;

  return {
    width: Math.round(maxWidth * PX_PER_MM),
    fontSize: currentValue(settings, draft, 'font_size') ?? DEFAULT_FONT_SIZE,
    // printer-v2.dc.html:741 for "Sem margem".
    padding: currentNoMargin(settings, draft)
      ? `10px 4px ${PAPER_BOTTOM}px`
      : `${Math.round(margin * MARGIN_SCALE)}px ${Math.round(margin * MARGIN_SCALE)}px ${PAPER_BOTTOM}px`,
  };
}
