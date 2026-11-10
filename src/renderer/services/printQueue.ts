import { uuidv4 } from 'renderer/helpers/uuid';
import type { EnqueueResult, EnqueueSource, PrintJobKind } from 'shared/printQueue';

// One item per printer, as the delivery-api answers.
export type ReceiptResponse = {
  content: string;
  copies: number;
  device_name: string | null;
};

type Work = { kind: PrintJobKind; source: EnqueueSource; orderUuid?: string; label: string };

// Hands the whole response to the queue in the main process in one call, so it is
// persisted together. The ids are new on every call (a print attempt, not the
// work): the main deduplicates by order + kind.
export function enqueueReceipts(receipts: ReceiptResponse[], work: Work): Promise<EnqueueResult> {
  return window.electron.enqueue({
    kind: work.kind,
    source: work.source,
    orderUuid: work.orderUuid,
    label: work.label,
    items: receipts.map(receipt => {
      // One id for the job and for the temporary file: it is the job id that goes to
      // the log, and the leftover %TEMP%\<id>.print.html of a failure is what the
      // support has to match to it.
      const id = uuidv4();

      return {
        id,
        payload: { content: receipt.content, copies: receipt.copies, deviceName: receipt.device_name, id },
      };
    }),
  });
}
