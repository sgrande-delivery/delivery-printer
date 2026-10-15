import { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { PrintPayload } from 'shared/printQueue';
import { findPrinterByDeviceName } from 'shared/printerMatch';

// Shared by the rawPrint channel and by the queue worker. Rejects with the
// Electron reason when the printer refuses.
export async function printReceipt({ content, copies, deviceName, id }: PrintPayload): Promise<void> {
  const win = new BrowserWindow({ show: false });

  try {
    const file = path.join(os.tmpdir(), `${id}.print.html`);

    fs.writeFileSync(file, content);

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
          margins: {
            marginType: 'none',
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
