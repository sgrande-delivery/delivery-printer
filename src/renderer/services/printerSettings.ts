import { api } from './api';
import type { PrinterSetting } from 'renderer/types/restaurant';

// The baseline is restaurant.printer_settings from /users/me, kept as a bag on purpose: the
// settings are key/value ROWS in the delivery-api, so no key is guaranteed, and a key this app
// has never heard of has to survive a round trip.
//
// NOT from GET /printerSettings: that route reads `restaurant_settings` (the general settings,
// 30+ unrelated keys) while the PUT writes `printer_settings`.
export type PrinterSettingsData = Partial<PrinterSetting> & Record<string, unknown>;

// The keys the restaurant signup seeds in printer_settings (OnCreatedRestaurantUseCase).
const KNOWN_KEYS = [
  'font_size',
  'production_template_copies',
  'shipment_template_copies',
  'no_margin',
  'max_width',
  'margin_size',
  'delivery_printer_version',
] as const;

// Every restaurant has the seven rows since signup, so a baseline with none of them is a
// wrong source (or a broken session), never a "new restaurant". Saving over it would delete
// the real rows. A shape check cannot catch this: the wrong source is also a plain object.
export function hasKnownSettings(data: PrinterSettingsData): boolean {
  return KNOWN_KEYS.some(key => key in data);
}

export class UntrustedBaselineError extends Error {
  constructor() {
    super('printer settings baseline has none of the known keys');
    this.name = 'UntrustedBaselineError';
  }
}

// PUT /printerSettings DELETES every setting row of the restaurant and recreates one per
// key of the payload (UpdatePrinterSettingsUseCase). Any key left out is destroyed, so the
// payload is always the baseline, plus only the fields the operator changed — never built
// from scratch.
//
// That includes `delivery_printer_version` and `max_width`, which this app does not edit
// (the admin panel reads the version for the installer download link), and keys this app has
// never heard of.
//
// The API validates nothing here (a misspelt key is stored silently) and the delete+create
// is not in a transaction, so a partial payload is the one thing that must never be sent.
export async function updatePrinterSettings(
  loaded: PrinterSettingsData,
  changes: Partial<PrinterSetting>
): Promise<PrinterSettingsData> {
  if (!hasKnownSettings(loaded)) {
    throw new UntrustedBaselineError();
  }

  const payload: PrinterSettingsData = { ...loaded, ...changes };

  await api.put('/printerSettings', payload);

  return payload;
}
