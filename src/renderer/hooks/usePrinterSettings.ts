import { useCallback } from 'react';
import { useAuth } from 'renderer/providers/auth';
import type { PrinterSettingsData } from 'renderer/services/printerSettings';
import type { PrinterSetting } from 'renderer/types/restaurant';

interface PrinterSettingsState {
  // restaurant.printer_settings from the session; empty when there is no session data.
  settings: PrinterSettingsData;
  // Adopt this payload (what was just saved) as the new baseline, with no second request.
  adopt(settings: PrinterSettingsData): void;
}

export function usePrinterSettings(): PrinterSettingsState {
  const { restaurant, setPrinterSettings } = useAuth();

  const adopt = useCallback(
    (settings: PrinterSettingsData): void => {
      setPrinterSettings(settings as PrinterSetting);
    },
    [setPrinterSettings]
  );

  const source: unknown = restaurant?.printer_settings;
  const settings: PrinterSettingsData =
    source && typeof source === 'object' && !Array.isArray(source) ? (source as PrinterSettingsData) : {};

  return { settings, adopt };
}
