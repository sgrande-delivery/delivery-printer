import { useCallback } from 'react';
import { useAuth } from 'renderer/providers/auth';
import { log } from 'renderer/services/log';
import { fetchPrinterSettings, type PrinterSettingsData } from 'renderer/services/printerSettings';
import type { PrinterSetting } from 'renderer/types/restaurant';

interface PrinterSettingsState {
  // restaurant.printer_settings from the session; empty when there is no session data.
  settings: PrinterSettingsData;
  // Adopt this payload (what was just saved) as the new baseline, with no second request.
  adopt(settings: PrinterSettingsData): void;
  // Reads the server's copy again and adopts it. Rejects when the read fails; resolves quietly when
  // the answer is unusable, keeping the session copy.
  revalidate(): Promise<void>;
}

export function usePrinterSettings(): PrinterSettingsState {
  const { restaurant, setPrinterSettings } = useAuth();

  const adopt = useCallback(
    (settings: PrinterSettingsData): void => {
      setPrinterSettings(settings as PrinterSetting);
    },
    [setPrinterSettings]
  );

  const revalidate = useCallback(async (): Promise<void> => {
    const fresh = await fetchPrinterSettings();

    if (fresh) {
      setPrinterSettings(fresh as PrinterSetting);
    } else {
      log.warn('printer settings revalidate: the answer is not usable, keeping the session copy');
    }
  }, [setPrinterSettings]);

  const source: unknown = restaurant?.printer_settings;
  const settings: PrinterSettingsData =
    source && typeof source === 'object' && !Array.isArray(source) ? (source as PrinterSettingsData) : {};

  return { settings, adopt, revalidate };
}
