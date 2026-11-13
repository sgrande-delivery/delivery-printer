import type { IpcMainInvokeEvent } from 'electron';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import { describeError } from 'shared/describeError';
import { readDefaultPrinterName } from '../defaultPrinter';
import { logger } from '../logger';
import { isDefaultPrinter } from '../printerInfo';

// Asks the webContents that made the call (the main window) instead of creating a
// hidden BrowserWindow: listing printers needs no page, only a webContents. Never
// rejects, because the printing screen must not break on a spooler failure; an
// empty list is the contract for "nothing to show" (Linux, dev, spooler down).
export async function onListPrinters(event: IpcMainInvokeEvent): Promise<WindowsPrinter[]> {
  try {
    const printers = await event.sender.getPrintersAsync();
    // Electron 43 does not flag the default (printerInfo.ts): only asked when no printer came flagged.
    const systemDefault = printers.some(printer => isDefaultPrinter(printer)) ? null : await readDefaultPrinterName();

    // No dedupe: printers.name has no unique index, two printers may share a name.
    return printers
      .map(printer => ({
        name: printer.name,
        displayName: printer.displayName || printer.name,
        isDefault: isDefaultPrinter(printer, systemDefault),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name));
  } catch (err) {
    logger.error('listing printers failed', describeError(err));

    return [];
  }
}
