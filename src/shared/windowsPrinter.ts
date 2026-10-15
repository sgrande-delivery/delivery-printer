// What the renderer needs to know about an installed printer. `name` is the OS
// device name, the same string the API sends as `device_name`: it is the key that
// decides where a receipt goes (a miss prints on the default printer, silently).
export type WindowsPrinter = {
  name: string;
  displayName: string;
  isDefault: boolean;
};
