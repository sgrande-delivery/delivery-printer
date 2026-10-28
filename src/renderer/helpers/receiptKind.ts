import type { IconName } from 'renderer/base/Icon';
import type { PrintJobKind } from 'shared/printQueue';

// The design's TYPES table (printer-v2.dc.html:522-527), by the kind the queue stores. `test` is not in
// the design (the mock has no test job) but the queue has it, and a pending job the screen cannot name is worse.
export const RECEIPT_KINDS: Record<PrintJobKind, { label: string; icon: IconName }> = {
  'order-created': { label: 'Produção', icon: 'skillet' },
  'order-dispatched': { label: 'Expedição', icon: 'two_wheeler' },
  board: { label: 'Mesa', icon: 'table_restaurant' },
  'board-billing': { label: 'Conta da mesa', icon: 'receipt' },
  test: { label: 'Teste', icon: 'receipt_long' },
};
