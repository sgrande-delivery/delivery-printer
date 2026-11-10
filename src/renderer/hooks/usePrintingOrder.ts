import { useCallback, useEffect, useRef } from 'react';
import { OrderData } from 'renderer/types/order';
import { api } from 'renderer/services/api';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { enqueueReceipts, ReceiptResponse } from 'renderer/services/printQueue';
import { buildPrintFailureNotice, printFailureReason, SERVER_FETCH_REASON } from 'renderer/helpers/printFailure';
import type { EnqueueSource, PrintJobKind } from 'shared/printQueue';
import { useOrderSocket } from './useOrderSocket';

type PrintingLayoutOptions = 'print-created' | 'print-dispatched';

const KIND: Record<PrintingLayoutOptions, PrintJobKind> = {
  'print-created': 'order-created',
  'print-dispatched': 'order-dispatched',
};

// Os tipos que levam marcação na API são exatamente os que este hook enfileira: lista de
// permissão, não de exclusão, para um tipo novo (a página de teste foi um) não passar a
// marcar pedido como impresso por omissão.
const MARKED_IN_API: PrintJobKind[] = Object.values(KIND);

const QUEUE_REASON = 'não foi possível guardar o comprovante na fila de impressão';

export function usePrintingOrder(): void {
  const { socket, isConnected } = useOrderSocket();

  const { handleOpen } = useMessaging();

  // handleOpen muda de identidade quando o snackbar abre; fora das dependências de print
  // para que abrir o aviso não refaça a varredura nem os listeners.
  const handleOpenRef = useRef(handleOpen);

  useEffect(() => {
    handleOpenRef.current = handleOpen;
  }, [handleOpen]);

  const notify = useCallback((subject: string, printer: string | null, reason: string) => {
    const notice = buildPrintFailureNotice(subject, printer, reason);
    handleOpenRef.current(notice.body);
    window.electron.notification(notice).catch((err: unknown) => log.error('notification failed', err));
  }, []);

  // PATCH é idempotente do lado da API (RN-03): pode repetir, ao contrário da impressão.
  const markPrinted = useCallback(async (orderUuid: string, label: string) => {
    try {
      await api.patch(`/orders/${orderUuid}/printed`);
    } catch (err) {
      // Saiu e está registrado em disco: a varredura da próxima reconexão repete só a marcação.
      log.error('printed mark failed', err, { orderUuid, label });
      handleOpenRef.current(
        `Foi impresso ${label}, mas não foi possível marcá-lo como impresso. Ele não sairá de novo; a marcação será tentada outra vez.`
      );
    }
  }, []);

  const print = useCallback(
    async (order: Pick<OrderData, 'uuid' | 'sequence'>, layout: PrintingLayoutOptions, source: EnqueueSource) => {
      const { uuid, sequence } = order;
      const label = `o pedido #${sequence}`;

      let receipts: ReceiptResponse[];

      try {
        const response = await api.get<ReceiptResponse[]>(`orders/${uuid}/${layout}`);
        receipts = response.data;
      } catch (err) {
        log.error('print failed before reaching the printer', err, { orderUuid: uuid, sequence, layout });
        notify(label, null, SERVER_FETCH_REASON);
        return;
      }

      try {
        const result = await enqueueReceipts(receipts, { kind: KIND[layout], source, orderUuid: uuid, label });

        // Só a varredura recebe isto: já saiu antes (talvez antes de um restart) e só a
        // marcação ficou pendente. Não reimprime, e a marcação é o que se repete.
        if (result === 'already-printed') {
          await markPrinted(uuid, label);
        }
      } catch (err) {
        log.error('enqueue failed', err, { orderUuid: uuid, sequence, layout });
        notify(label, null, QUEUE_REASON);
      }
    },
    [markPrinted, notify]
  );

  useEffect(() => {
    socket?.on('printOrder', (order: OrderData) => {
      print(order, 'print-created', 'event');
    });

    socket?.on('printShipment', (order: OrderData) => {
      print(order, 'print-dispatched', 'event');
    });

    return () => {
      socket?.off('printShipment');
      socket?.off('printOrder');
    };
  }, [print, socket]);

  // O main avisa que imprimiu (isto vale para os dois layouts do pedido); a marcação é daqui
  // porque a sessão da API mora no renderer.
  useEffect(
    () =>
      window.electron.onJobPrinted(job => {
        if (job.orderUuid && MARKED_IN_API.includes(job.kind)) {
          markPrinted(job.orderUuid, job.label ?? 'o pedido');
        }
      }),
    [markPrinted]
  );

  // Falha além do limite, de qualquer tipo de trabalho (inclusive mesa): é o único ponto que
  // avisa o operador, porque as tentativas anteriores o main refaz sozinho.
  useEffect(
    () =>
      window.electron.onJobFailed(job => {
        notify(job.label ?? 'um comprovante', job.deviceName, printFailureReason(job.lastError ?? ''));
      }),
    [notify]
  );

  useEffect(() => {
    async function findOrders() {
      try {
        const response = await api.get<OrderData[]>('/orders/print/list');
        await Promise.all(response.data.map(order => print(order, 'print-created', 'scan')));
      } catch (err) {
        log.error('pending orders scan failed', err);
      }
    }

    window.electron.notifyConnection(isConnected);

    if (isConnected) {
      findOrders();
    }
  }, [isConnected, print]);
}
