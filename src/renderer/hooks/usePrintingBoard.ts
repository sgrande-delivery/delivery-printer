import { useCallback, useEffect, useRef } from 'react';
import { BoardControlMovement } from 'renderer/types/boardControlMovement';
import { api } from 'renderer/services/api';
import { log } from 'renderer/services/log';
import { useMessaging } from 'renderer/providers/messaging';
import { enqueueReceipts, ReceiptResponse } from 'renderer/services/printQueue';
import { buildPrintFailureNotice, SERVER_FETCH_REASON } from 'renderer/helpers/printFailure';
import type { PrintJobKind } from 'shared/printQueue';
import { useBoardSocket } from './useBoardSocket';

type PrintingLayoutOptions = 'billing-content' | 'content';

const KIND: Record<PrintingLayoutOptions, PrintJobKind> = {
  content: 'board',
  'billing-content': 'board-billing',
};

const QUEUE_REASON = 'não foi possível guardar o comprovante na fila de impressão';

export function usePrintingBoard(): void {
  const { socket } = useBoardSocket();

  const { handleOpen } = useMessaging();

  // handleOpen muda de identidade quando o snackbar abre; num ref para não refazer os listeners.
  const handleOpenRef = useRef(handleOpen);

  useEffect(() => {
    handleOpenRef.current = handleOpen;
  }, [handleOpen]);

  const print = useCallback(async (session: BoardControlMovement, layout: PrintingLayoutOptions) => {
    const label = `o comprovante da mesa ${session.board_number}`;
    let reason = SERVER_FETCH_REASON;

    try {
      const response = await api.get<ReceiptResponse[]>(`board-sessions/${session.id}/${layout}`);

      reason = QUEUE_REASON;

      // Comprovante de mesa não tem marcação na API nem varredura: a fila em disco é a
      // única recuperação, e não leva orderUuid porque não há o que deduplicar.
      await enqueueReceipts(response.data, { kind: KIND[layout], source: 'event', label });
    } catch (err) {
      log.error('board print failed before reaching the queue', err, { boardSessionId: session.id, layout });

      const notice = buildPrintFailureNotice(label, null, reason);
      handleOpenRef.current(notice.body);
      window.electron.notification(notice).catch((err: unknown) => log.error('notification failed', err));
    }
  }, []);

  useEffect(() => {
    socket?.on('print_board_billing', (session: BoardControlMovement) => {
      print(session, 'billing-content');
    });

    socket?.on('print_board', (session: BoardControlMovement) => {
      print(session, 'content');
    });

    return () => {
      socket?.off('print_board_billing');
      socket?.off('print_board');
    };
  }, [print, socket]);
}
