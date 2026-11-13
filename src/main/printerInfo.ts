import { findPrinterByDeviceName, isSameDeviceName } from 'shared/printerMatch';
import { readDefaultPrinterName } from './defaultPrinter';

// `isDefault` is not in the PrinterInfo of Electron 43, and it does not come at runtime either (measured on
// Linux/CUPS, spec 95): it is still read through narrowing, in case a platform fills it in, and otherwise the
// system default named by the operating system (defaultPrinter.ts) is the one.
export function isDefaultPrinter(printer: object, systemDefault: string | null = null): boolean {
  if ('isDefault' in printer && printer.isDefault === true) {
    return true;
  }

  return (
    systemDefault !== null &&
    'name' in printer &&
    typeof printer.name === 'string' &&
    isSameDeviceName(printer.name, systemDefault)
  );
}

// The installed printer a print with no matching device name goes to. Undefined when the system has no default,
// or names one that is not in the list.
export async function findDefaultPrinter<T extends { name: string }>(printers: T[]): Promise<T | undefined> {
  const flagged = printers.find(printer => isDefaultPrinter(printer));

  if (flagged) {
    return flagged;
  }

  return findPrinterByDeviceName(printers, await readDefaultPrinterName());
}
