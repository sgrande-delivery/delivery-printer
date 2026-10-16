import { api } from './api';
import type { Printer } from 'renderer/types/printer';

// No pagination parameter, on purpose: the delivery-api validates `rows` against a closed
// list ([10, 20, 50, 100], GetPrintersRequest) and answers 422 to anything else. Sending
// neither `page` nor `rows` makes it return every printer of the restaurant as a plain array.
export async function fetchPrinters(): Promise<Printer[]> {
  const response = await api.get<Printer[]>('/printers');

  return response.data;
}

export type PaperWidth = 58 | 80;

// What PUT /printers/:id takes, and it has to be the WHOLE record.
//
// `name` and `address` are both `required` in the API's UpdatePrinterRequest: a payload
// with only the name answers 422. `copies` is min 1 / max 3 there.
//
// The other fields are `sometimes`, which reads like "optional" and is not: omitting one
// does not keep its value, it RESETS it. `UpdatePrinterInput` is a DTO whose absent keys
// keep the property defaults (`activated = true`, `station = null`, `paper_width = 80`,
// `copies = 1`) and `PrinterRepository::update()` writes all six columns from it. A PUT
// without `activated` therefore re-activates a printer the operator had turned off.
export interface UpdatePrinterPayload {
  name: string;
  address: string;
  activated: boolean;
  copies: number;
  paper_width: PaperWidth;
  station: string | null;
}

export async function updatePrinter(id: number, payload: UpdatePrinterPayload): Promise<void> {
  await api.put(`/printers/${id}`, payload);
}

// Own route on purpose, instead of flipping `activated` through the PUT: it is atomic (the
// only transactional use case of the module, and the flip is a single `NOT activated`
// statement) and needs neither `name` nor `address`. It is not idempotent — two calls land
// back on the original state — so the caller has to keep the operator from firing it twice.
export async function togglePrinterActive(id: number): Promise<void> {
  await api.patch(`/printers/${id}/toggle-active`);
}
