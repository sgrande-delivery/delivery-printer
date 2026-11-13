// `isDefault` is filled in by Electron at runtime but is not in the PrinterInfo
// typings of Electron 43, so it is read through narrowing, not trusted by type.
export function isDefaultPrinter(printer: object): boolean {
  return 'isDefault' in printer && printer.isDefault === true;
}
