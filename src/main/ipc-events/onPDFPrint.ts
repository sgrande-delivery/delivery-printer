import { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';

type Payload = {
  content: string;
  id: string;
};

function normalizeBase64(input: string): string {
  const prefix = 'data:application/pdf;base64,';

  if (input.startsWith(prefix)) {
    return input.slice(prefix.length);
  }

  return input;
}

export async function onPDFPrint(event: IpcMainInvokeEvent, { content, id }: Payload) {
  const win = new BrowserWindow({ show: true });

  const file = path.join(os.tmpdir(), `${id}.print.pdf`);

  const pdfBuffer = Buffer.from(normalizeBase64(content), 'base64');
  fs.writeFileSync(file, new Uint8Array(pdfBuffer));

  const printers = await win.webContents.getPrintersAsync();
  const printer = printers.find(printer => printer.isDefault);

  await win.webContents.loadFile(file);

  await new Promise((resolve, reject) => {
    win.webContents.print(
      {
        silent: true,
        deviceName: printer?.name,
        color: false,
        collate: false,
        copies: 1,
        margins: {
          marginType: 'none',
        },
      },
      (success, reason) => {
        win.close();

        if (success) {
          fs.rmSync(file);
          resolve(success);
          return;
        }

        reject(reason);
      }
    );
  });
}
