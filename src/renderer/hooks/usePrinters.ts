import { useMemo } from 'react';
import { AxiosError } from 'axios';
import { fetchPrinters } from 'renderer/services/printers';
import { log } from 'renderer/services/log';
import type { Printer } from 'renderer/types/printer';
import { findPrinterByDeviceName } from 'shared/printerMatch';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import { createSharedStore, useSharedStore } from './sharedStore';

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
  // Every device of this computer: the only names the edit form offers.
  devices: WindowsPrinter[];
  // False when this computer's printer list came back empty (or could not be read).
  devicesRead: boolean;
  // Reads again without leaving 'ready': for a change made on a row, where blanking the
  // whole screen to reflect one line would hide the very confirmation the operator waits for.
  refresh(): void;
  // Reads again from 'loading': for the retry, where there is nothing on screen to keep.
  reload(): void;
  // Reads again unless a read is already in flight: for a screen that opens, which wants fresh data
  // without doubling the request the first reader just started.
  revalidate(): void;
}

type PrintersSnapshot = Omit<PrintersState, 'refresh' | 'reload' | 'revalidate'>;

// The matching rule is `shared/printerMatch`, the same call the print itself makes
// (printReceipt in src/main/ipc-events/onRawPrint.ts): one criterion, so the screen
// cannot say "found" for a name the print will not find.
export function resolvePrinters(printers: Printer[], devices: WindowsPrinter[]): { printers: ResolvedPrinter[] } {
  const resolved = printers.map(printer => ({
    ...printer,
    resolvedDevice: findPrinterByDeviceName(devices, printer.name)?.name ?? null,
  }));
  return { printers: resolved };
}

async function listDevices(): Promise<WindowsPrinter[]> {
  try {
    return await window.electron.listPrinters();
  } catch (err) {
    log.error('list windows printers failed', err);
    return [];
  }
}

const initial: PrintersSnapshot = {
  status: 'loading',
  printers: [],
  devices: [],
  devicesRead: true,
};

// Only the latest read may write, and `inFlight` is whether that latest one has not answered yet.
let request = 0;
let inFlight = false;

// One copy for the whole shell: the sidebar badge, the dashboard and the printers screen read the same
// list, so they are never apart and the API is asked once per entry instead of once per reader.
const store = createSharedStore<PrintersSnapshot>(initial, () => {
  // The operator fixes a name in Windows and comes back to the app: that is the moment the answer changes.
  window.addEventListener('focus', revalidate);

  load();

  return () => {
    window.removeEventListener('focus', revalidate);
    request++;
    inFlight = false;
  };
});

function load(): void {
  const mine = ++request;

  inFlight = true;

  Promise.all([fetchPrinters(), listDevices()])
    .then(([registered, devices]) => {
      if (mine !== request) {
        return;
      }

      const result = resolvePrinters(registered, devices);

      inFlight = false;
      store.set({
        status: 'ready',
        printers: result.printers,
        devices,
        devicesRead: devices.length > 0,
      });
    })
    .catch((err: unknown) => {
      if (mine !== request) {
        return;
      }

      // 403 is a session without permission, not "no printers": the screen must say so.
      const forbidden = err instanceof AxiosError && err.response?.status === 403;

      inFlight = false;
      store.set({ ...store.get(), status: forbidden ? 'forbidden' : 'error' });

      if (forbidden) {
        // Support needs the trace: it means the restaurant lacks `role:printer` in the API.
        log.warn('fetch printers forbidden (403)');
      } else {
        log.error('fetch printers failed', err);
      }
    });
}

// The first load starts from the initial 'loading'; only a retry has to go back to it.
function reload(): void {
  store.set({ ...store.get(), status: 'loading' });
  load();
}

function revalidate(): void {
  if (!inFlight) {
    load();
  }
}

export function usePrinters(): PrintersState {
  const snapshot = useSharedStore(store);

  return useMemo(() => ({ ...snapshot, refresh: load, reload, revalidate }), [snapshot]);
}
