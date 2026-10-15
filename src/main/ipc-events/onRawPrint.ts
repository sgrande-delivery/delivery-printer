import { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { PrintPayload } from 'shared/printQueue';

// Shared by the rawPrint channel and by the queue worker. Rejects with the
// Electron reason when the printer refuses.
export async function printReceipt({ content, copies, deviceName, id }: PrintPayload): Promise<void> {
  const win = new BrowserWindow({ show: false });

  try {
    const file = path.join(os.tmpdir(), `${id}.print.html`);

    fs.writeFileSync(file, content);

    const printers = await win.webContents.getPrintersAsync();
    const printer = printers.find(printer => printer.name.toLowerCase() === deviceName?.toLowerCase());

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

// Direct print, outside the queue: the local test of the printing screen wants an
// immediate answer, not a retry that comes out minutes later.
export async function onRawPrint(event: IpcMainInvokeEvent, payload: PrintPayload): Promise<void> {
  await printReceipt(payload);
}
