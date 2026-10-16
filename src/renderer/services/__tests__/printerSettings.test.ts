import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasKnownSettings, updatePrinterSettings, UntrustedBaselineError } from '../printerSettings';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock('renderer/services/api', () => ({ api: { get: mocks.get, put: mocks.put } }));

describe('updatePrinterSettings', () => {
  beforeEach(() => {
    mocks.put.mockReset().mockResolvedValue({ data: {} });
  });

  // The PUT deletes every row and recreates one per payload key: whatever the GET returned
  // and the payload omits is destroyed. Building the payload from the edited field alone
  // makes this fail.
  it('changing ONE field sends every key the GET returned, unknown and version included', async () => {
    const loaded = {
      font_size: 12,
      shipment_template_copies: 1,
      production_template_copies: 2,
      no_margin: false,
      max_width: 80,
      margin_size: 4,
      delivery_printer_version: '1.4.2',
      a_key_added_by_the_admin_later: 'raw string',
    };

    await updatePrinterSettings(loaded, { production_template_copies: 3 });

    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put).toHaveBeenCalledWith('/printerSettings', { ...loaded, production_template_copies: 3 });
  });

  it('does not invent keys the API did not return', async () => {
    await updatePrinterSettings({ font_size: 12 }, { margin_size: 20 });

    expect(mocks.put).toHaveBeenCalledWith('/printerSettings', { font_size: 12, margin_size: 20 });
  });

  it('returns the payload it sent and leaves the loaded object untouched', async () => {
    const loaded = { font_size: 12, delivery_printer_version: '1.4.2' };

    const saved = await updatePrinterSettings(loaded, { font_size: 14 });

    expect(saved).toEqual({ font_size: 14, delivery_printer_version: '1.4.2' });
    expect(loaded.font_size).toBe(12);
  });
});

describe('the sanity gate', () => {
  beforeEach(() => {
    mocks.put.mockReset().mockResolvedValue({ data: {} });
  });

  it('refuses a baseline with none of the seven known keys, without calling the API', async () => {
    await expect(updatePrinterSettings({}, { font_size: 14 })).rejects.toBeInstanceOf(UntrustedBaselineError);
    await expect(updatePrinterSettings({ pizza_calculate: 'max' }, { font_size: 14 })).rejects.toBeInstanceOf(
      UntrustedBaselineError
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('accepts a baseline with at least one known key', () => {
    expect(hasKnownSettings({ delivery_printer_version: '1.0.0' })).toBe(true);
    expect(hasKnownSettings({ pizza_calculate: 'max' })).toBe(false);
  });
});
