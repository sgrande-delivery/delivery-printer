import type { PrintJobKind } from 'shared/printQueue';

// The design's TYPES table (printer-v2.dc.html), by the kind the queue stores.
export const receiptKindLabels: Record<PrintJobKind, string> = {
  'order-created': 'Produção',
  'order-dispatched': 'Expedição',
  board: 'Mesa',
  'board-billing': 'Conta da mesa',
  test: 'Teste',
};
