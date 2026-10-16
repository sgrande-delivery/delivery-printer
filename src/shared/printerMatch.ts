// The one criterion that decides where a receipt comes out: case-insensitive equality
// of the whole device name, first match wins. No trim and no accent folding, because
// what has to match is the exact string Windows reports.
//
// It lives in shared/ because both sides ask the same question and have to get the same
// answer: the main process when it picks the printer (ipc-events/onRawPrint) and the
// printers screen when it tells the operator what the print will do. A looser rule on
// one side would make the screen promise a device the print will not find.
//
// `deviceName` is nullable on purpose: the API sends `device_name: null` for a
// restaurant with a single printer, and no match means the system default printer.
export function findPrinterByDeviceName<T extends { name: string }>(
  printers: T[],
  deviceName: string | null | undefined
): T | undefined {
  return printers.find(printer => printer.name.toLowerCase() === deviceName?.toLowerCase());
}
