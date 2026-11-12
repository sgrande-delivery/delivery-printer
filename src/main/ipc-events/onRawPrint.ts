import { app, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { PrintPayload } from 'shared/printQueue';
import { findPrinterByDeviceName } from 'shared/printerMatch';
import { getPrintFontFacesCss, withPrintFontFaces } from '../printFonts';

// Shared by the rawPrint channel and by the queue worker. Rejects with the
// Electron reason when the printer refuses.
export async function printReceipt({ content, copies, deviceName, id }: PrintPayload): Promise<void> {
  const win = new BrowserWindow({ show: false });

  try {
    const file = path.join(os.tmpdir(), `${id}.print.html`);

    fs.writeFileSync(file, withPrintFontFaces(content, getPrintFontFacesCss(app)));

    const printers = await win.webContents.getPrintersAsync();
    const printer = findPrinterByDeviceName(printers, deviceName);

    await win.webContents.loadFile(file);

    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          deviceName: printer?.name,
          color: false,
          collate: false,
          copies,
          // 'none' lays the page out over the whole sheet, including the strip the printer
          // cannot reach: on an 80 mm roll the head covers ~72 mm and the receipt was cut on
          // the right. 'printableArea' makes the content box the area the driver declares, and
          // the API's relative container (max-width: Xmm; width: 100%) shrinks into it, so the
          // document it renders needs no change — Chromium ignores the HTML's @page margin for
          // any type but 'default' (spec 89, RN-02; not measurable from this repo).
          margins: {
            marginType: 'printableArea',
          },
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
