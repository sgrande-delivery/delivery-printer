import { useCallback, useEffect, useRef } from 'react';
import { BoardControlMovement } from 'renderer/types/boardControlMovement';
import { api } from 'renderer/services/api';
import { uuidv4 } from 'renderer/helpers/uuid';
import { log } from 'renderer/services/log';
import { useMessaging } from 'renderer/providers/messaging';
import { buildPrintFailureNotice, printFailureReason, SERVER_FETCH_REASON } from 'renderer/helpers/printFailure';
import { useBoardSocket } from './useBoardSocket';

type PrintingLayoutOptions = 'billing-content' | 'content';

type Response = {
  content: string;
  copies: number;
  device_name: string | null;
};

export function usePrintingBoard(): void {
  const { socket } = useBoardSocket();

  const { handleOpen } = useMessaging();

  // handleOpen muda de identidade quando o snackbar abre; num ref para não refazer os listeners.
  const handleOpenRef = useRef(handleOpen);

  useEffect(() => {
    handleOpenRef.current = handleOpen;
  }, [handleOpen]);

  const print = useCallback(async (session: BoardControlMovement, layout: PrintingLayoutOptions) => {
    let logged = false;
    let failedPrinter: string | null = null;

    try {
      const response = await api.get<Response[]>(`board-sessions/${session.id}/${layout}`);

      const promises = response.data.map(payload =>
        window.electron
          .rawPrint({
            content: payload.content,
            copies: payload.copies,
            deviceName: payload.device_name,
            id: uuidv4(),
          })
          .catch((err: unknown) => {
            logged = true;
            failedPrinter = payload.device_name;
            log.error('board print failed', err, { boardSessionId: session.id, layout, printer: payload.device_name });
            throw err;
          })
      );

      await Promise.all(promises);
    } catch (err) {
      if (!logged) {
        log.error('board print failed before reaching the printer', err, { boardSessionId: session.id, layout });
      }

      const notice = buildPrintFailureNotice(
        `o comprovante da mesa ${session.board_number}`,
        failedPrinter,
        logged ? printFailureReason(err) : SERVER_FETCH_REASON
      );
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
