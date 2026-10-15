import { api } from './api';
import type { Printer } from 'renderer/types/printer';

// No pagination parameter, on purpose: the delivery-api validates `rows` against a closed
// list ([10, 20, 50, 100], GetPrintersRequest) and answers 422 to anything else. Sending
// neither `page` nor `rows` makes it return every printer of the restaurant as a plain array.
export async function fetchPrinters(): Promise<Printer[]> {
  const response = await api.get<Printer[]>('/printers');

  return response.data;
}
