import { app, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { PrintPayload } from 'shared/printQueue';
import { findPrinterByDeviceName } from 'shared/printerMatch';
import { logger } from '../logger';
import { getPrintFontFacesCss, withPrintStyle } from '../printFonts';
import { documentWidthMm, driverMediaOptions, driverPaperMm, resolvePrintGeometry } from '../printGeometry';
import { isDefaultPrinter } from '../printerInfo';
import { printerPreferenceFor } from '../printerPreferences';

// Shared by the rawPrint channel and by the queue worker. Rejects with the
// Electron reason when the printer refuses.
export async function printReceipt({
  content,
  copies,
  deviceName,
  id,
  measurePaperWidthMm,
}: PrintPayload): Promise<void> {
  const win = new BrowserWindow({ show: false });

  try {
    const file = path.join(os.tmpdir(), `${id}.print.html`);

    const printers = await win.webContents.getPrintersAsync();
    const printer = findPrinterByDeviceName(printers, deviceName);
    // Where the receipt really comes out: no match is the system default, and its useful width is the one that
    // applies (spec 95, RN-03) — the single-printer restaurant gets device_name null from the API.
    const target = printer ?? printers.find(isDefaultPrinter);
    const usefulWidthMm = printerPreferenceFor(target?.name)?.usefulWidthMm ?? null;
    const driverPaper = driverPaperMm(target?.options);
    const geometry = resolvePrintGeometry({
      usefulWidthMm,
      driverPaper,
      documentWidthMm: documentWidthMm(content),
      measurePaperWidthMm: measurePaperWidthMm ?? null,
    });

    // One line per print, and nothing of the receipt in it (spec 95, RN-08): without it support cannot tell
    // "the driver lied" from "the HTML is too wide".
    logger.info('print-geometry', {
      device: target?.name ?? null,
      matched: printer !== undefined,
      driverMedia: driverMediaOptions(target?.options),
      driverPaper,
      marginType: geometry.margins.marginType,
      pageSize: geometry.pageSize ?? null,
      usefulWidthMm,
      reason: geometry.reason,
    });

    if (geometry.reason === 'invalid-driver-paper') {
      logger.warn('print-geometry: the driver declares an invalid paper, forcing pageSize', {
        device: target?.name ?? null,
        driverPaper,
      });
    }

    const css = [getPrintFontFacesCss(app), geometry.widthCss].filter(Boolean).join('\n');

    fs.writeFileSync(file, withPrintStyle(content, css));

    await win.webContents.loadFile(file);

    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          // The match, not the target: with no match Electron picks the system default by itself, and the
          // option stays the one it always was.
          deviceName: printer?.name,
          color: false,
          collate: false,
          copies,
          margins: geometry.margins,
          ...(geometry.pageSize && { pageSize: geometry.pageSize }),
        },
        (success, reason) => {
          if (success) {
            fs.rmSync(file);
            resolve(success);
            return;
          }

          reject(reason);
        }
      );
    });
  } finally {
    // The queue retries, so a window left behind by a failed attempt would pile up.
    if (!win.isDestroyed()) {
      win.close();
    }
  }
}

// Direct print, outside the queue, and with no caller in the renderer: the local test
// page is queued like a receipt, so it inherits the retry and the failure on screen.
// Anything new that prints goes through the queue, not through here.
export async function onRawPrint(event: IpcMainInvokeEvent, payload: PrintPayload): Promise<void> {
  await printReceipt(payload);
}
