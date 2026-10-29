import { describe, expect, it } from 'vitest';
import {
  CLOSED_SETS,
  currentNoMargin,
  currentValue,
  diffChanges,
  isDirty,
  marginHint,
  optionLabel,
  previewMetrics,
  readNumber,
  stepOptions,
} from '../printerSettingsModel';

const settings = {
  font_size: 14,
  production_template_copies: 2,
  shipment_template_copies: 1,
  no_margin: false,
  max_width: 80,
  margin_size: 15,
};

describe('closed sets', () => {
  it('are the admin panel sets, in px for the margin', () => {
    expect(CLOSED_SETS.font_size).toEqual([12, 14, 16, 18, 20, 22, 24]);
    expect(CLOSED_SETS.production_template_copies).toEqual([1, 2, 3, 4]);
    expect(CLOSED_SETS.shipment_template_copies).toEqual([1, 2, 3, 4]);
    expect(CLOSED_SETS.margin_size).toEqual([1, 10, 15, 20, 25, 30, 35, 40]);
  });
});

describe('optionLabel', () => {
  it('writes the unit of each field, and the stored 1 as 0 px', () => {
    expect(optionLabel('font_size', 14)).toBe('14 px');
    expect(optionLabel('margin_size', 15)).toBe('15 px');
    expect(optionLabel('margin_size', 1)).toBe('0 px');
    expect(optionLabel('production_template_copies', 3)).toBe('3');
  });
});

describe('readNumber', () => {
  it('ignores a value that is not a usable number', () => {
    expect(readNumber({ font_size: 14 }, 'font_size')).toBe(14);
    expect(readNumber({ font_size: NaN }, 'font_size')).toBeUndefined();
    expect(readNumber({ font_size: Infinity }, 'font_size')).toBeUndefined();
    expect(readNumber({ font_size: '14' as unknown as number }, 'font_size')).toBeUndefined();
  });
});

describe('stepOptions', () => {
  it('is the closed set when the stored value belongs to it or is missing', () => {
    expect(stepOptions('font_size', 14).map(option => option.value)).toEqual([12, 14, 16, 18, 20, 22, 24]);
    expect(stepOptions('font_size', undefined).map(option => option.value)).toEqual([12, 14, 16, 18, 20, 22, 24]);
  });

  it('keeps a stored value outside the set, in order, and only that one', () => {
    expect(stepOptions('font_size', 13).map(option => option.value)).toEqual([12, 13, 14, 16, 18, 20, 22, 24]);
    expect(stepOptions('margin_size', 5).map(option => option.value)).toEqual([1, 5, 10, 15, 20, 25, 30, 35, 40]);
  });
});

describe('currentValue and currentNoMargin', () => {
  it('prefer the draft, then the baseline', () => {
    expect(currentValue(settings, {}, 'font_size')).toBe(14);
    expect(currentValue(settings, { font_size: 18 }, 'font_size')).toBe(18);
    expect(currentValue({}, {}, 'font_size')).toBeUndefined();
    expect(currentNoMargin(settings, {})).toBe(false);
    expect(currentNoMargin(settings, { no_margin: true })).toBe(true);
    expect(currentNoMargin({ no_margin: true }, { no_margin: false })).toBe(false);
  });
});

describe('diffChanges and isDirty', () => {
  it('keeps only what differs from the baseline', () => {
    expect(diffChanges(settings, { font_size: 14, margin_size: 20 })).toEqual({ margin_size: 20 });
    expect(diffChanges(settings, { no_margin: false })).toEqual({});
    expect(diffChanges(settings, { no_margin: true })).toEqual({ no_margin: true });
    expect(diffChanges(settings, {})).toEqual({});
  });

  it('treats a key the server did not return as a change once the operator fills it', () => {
    expect(diffChanges({}, { font_size: 12 })).toEqual({ font_size: 12 });
  });

  it('is dirty exactly when something differs', () => {
    expect(isDirty(settings, {})).toBe(false);
    expect(isDirty(settings, { font_size: 14 })).toBe(false);
    expect(isDirty(settings, { font_size: 16 })).toBe(true);
    expect(isDirty(settings, { no_margin: true })).toBe(true);
  });
});

describe('marginHint', () => {
  it('names the unit, or the switch that turned the margin off', () => {
    expect(marginHint(false)).toBe('Em pixels');
    expect(marginHint(true)).toBe('Desligada por "Sem margem"');
  });
});

describe('previewMetrics', () => {
  it('draws the paper at 3.2 px per millimetre of the saved width', () => {
    expect(previewMetrics(settings, {}).width).toBe(256);
    expect(previewMetrics({ ...settings, max_width: 58 }, {}).width).toBe(186);
  });

  it('falls back to 80 mm when the width is missing or not usable', () => {
    expect(previewMetrics({}, {}).width).toBe(256);
    expect(previewMetrics({ max_width: 0 }, {}).width).toBe(256);
    expect(previewMetrics({ max_width: '80' as unknown as number }, {}).width).toBe(256);
  });

  it('follows the font size, draft first, 14 when unset', () => {
    expect(previewMetrics(settings, {}).fontSize).toBe(14);
    expect(previewMetrics(settings, { font_size: 22 }).fontSize).toBe(22);
    expect(previewMetrics({}, {}).fontSize).toBe(14);
  });

  it('pads every side by the margin, scaled to the paper, with the 22 px bottom', () => {
    expect(previewMetrics(settings, {}).padding).toBe('13px 13px 22px');
    expect(previewMetrics(settings, { margin_size: 40 }).padding).toBe('34px 34px 22px');
    expect(previewMetrics(settings, { margin_size: 1 }).padding).toBe('1px 1px 22px');
  });

  it('uses the thin fixed padding of the design when there is no margin, whatever the margin value', () => {
    expect(previewMetrics(settings, { no_margin: true }).padding).toBe('10px 4px 22px');
    expect(previewMetrics(settings, { no_margin: true, margin_size: 40 }).padding).toBe('10px 4px 22px');
  });
});
