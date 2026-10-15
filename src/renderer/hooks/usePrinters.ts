import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { fetchPrinters } from 'renderer/services/printers';
import { log } from 'renderer/services/log';
import type { Printer } from 'renderer/types/printer';
import { findPrinterByDeviceName } from 'shared/printerMatch';
import type { WindowsPrinter } from 'shared/windowsPrinter';

// How the screen's load went. Not the printer's own status: that one is 'online'/'offline'
// and belongs to the printer:status emission (task #25), which must not collide with this.
export type PrintersLoadStatus = 'loading' | 'ready' | 'forbidden' | 'error';

export interface ResolvedPrinter extends Printer {
  // The Windows device the receipt will really go to, or null when the name matches none.
  resolvedDevice: string | null;
}

interface PrintersState {
  status: PrintersLoadStatus;
  printers: ResolvedPrinter[];
  // Installed on this machine but registered under no name.
  unregistered: WindowsPrinter[];
  // Every device of this computer: the only names the edit form offers.
  devices: WindowsPrinter[];
  // False when this computer's printer list came back empty (or could not be read).
  devicesRead: boolean;
  // Reads again without leaving 'ready': for a change made on a row, where blanking the
  // whole screen to reflect one line would hide the very confirmation the operator waits for.
  refresh(): void;
  // Reads again from 'loading': for the retry, where there is nothing on screen to keep.
  reload(): void;
}

// The matching rule is `shared/printerMatch`, the same call the print itself makes
// (printReceipt in src/main/ipc-events/onRawPrint.ts): one criterion, so the screen
// cannot say "found" for a name the print will not find.
export function resolvePrinters(
  printers: Printer[],
  devices: WindowsPrinter[]
): { printers: ResolvedPrinter[]; unregistered: WindowsPrinter[] } {
  const resolved = printers.map(printer => ({
    ...printer,
    resolvedDevice: findPrinterByDeviceName(devices, printer.name)?.name ?? null,
  }));
  const unregistered = devices.filter(device => !findPrinterByDeviceName(printers, device.name));

  return { printers: resolved, unregistered };
}

async function listDevices(): Promise<WindowsPrinter[]> {
  try {
    return await window.electron.listPrinters();
  } catch (err) {
    log.error('list windows printers failed', err);
    return [];
  }
}

export function usePrinters(): PrintersState {
  const [status, setStatus] = useState<PrintersLoadStatus>('loading');
  const [printers, setPrinters] = useState<ResolvedPrinter[]>([]);
  const [unregistered, setUnregistered] = useState<WindowsPrinter[]>([]);
  const [devices, setDevices] = useState<WindowsPrinter[]>([]);
  const [devicesRead, setDevicesRead] = useState(true);
  const requestRef = useRef(0);

  const load = useCallback((): void => {
    const request = ++requestRef.current;

    Promise.all([fetchPrinters(), listDevices()])
      .then(([registered, devices]) => {
        if (request !== requestRef.current) {
          return;
        }

        const result = resolvePrinters(registered, devices);

        setPrinters(result.printers);
        setUnregistered(result.unregistered);
        setDevices(devices);
        setDevicesRead(devices.length > 0);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (request !== requestRef.current) {
          return;
        }

        // 403 is a session without permission, not "no printers": the screen must say so.
        const forbidden = err instanceof AxiosError && err.response?.status === 403;

        setStatus(forbidden ? 'forbidden' : 'error');

        if (forbidden) {
          // Support needs the trace: it means the restaurant lacks `role:printer` in the API.
          log.warn('fetch printers forbidden (403)');
        } else {
          log.error('fetch printers failed', err);
        }
      });
  }, []);

  // The first load starts from the initial 'loading'; only a retry has to go back to it.
  const reload = useCallback((): void => {
    setStatus('loading');
    load();
  }, [load]);

  useEffect(() => {
    // Aliased inside the effect because react-hooks/exhaustive-deps warns on reading
    // `requestRef.current` from a cleanup function. Do not inline it back.
    const request = requestRef;

    load();

    return () => {
      request.current++;
    };
  }, [load]);

  return { status, printers, unregistered, devices, devicesRead, refresh: load, reload };
}
