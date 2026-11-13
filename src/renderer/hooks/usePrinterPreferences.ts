import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from 'renderer/services/log';
import type { PrinterPreferences } from 'shared/printerGeometry';

interface PrinterPreferencesState {
  // Every Windows device with a useful width saved on this machine. {} until the first read lands.
  preferences: PrinterPreferences;
  // Saves (null = automatic) and adopts the map the main process answers with, never a local merge: the main
  // process folds another spelling of the same device into one entry, and only its answer says so. Rejects
  // when the write fails, so the caller can say it.
  setUsefulWidth(deviceName: string, usefulWidthMm: number | null): Promise<void>;
}

// One screen reads this (the printers screen), so no shared store.
export function usePrinterPreferences(): PrinterPreferencesState {
  const [preferences, setPreferences] = useState<PrinterPreferences>({});
  // A write that lands before the first read must not be overwritten by it: the read is older.
  const wrote = useRef(false);

  useEffect(() => {
    let alive = true;

    window.electron
      .printerPreferences()
      .then(read => {
        if (alive && !wrote.current) {
          setPreferences(read);
        }
      })
      .catch((err: unknown) => {
        // The print would treat an unreadable file the same way: every printer automatic.
        log.error('read printer preferences failed', err);
      });

    return () => {
      alive = false;
    };
  }, []);

  const setUsefulWidth = useCallback(async (deviceName: string, usefulWidthMm: number | null): Promise<void> => {
    const next = await window.electron.setPrinterUsefulWidth(deviceName, usefulWidthMm);

    wrote.current = true;
    setPreferences(next);
  }, []);

  return { preferences, setUsefulWidth };
}
