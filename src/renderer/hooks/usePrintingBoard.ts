import { useCallback, useEffect } from 'react';
import { BoardControlMovement } from 'renderer/types/boardControlMovement';
import { api } from 'renderer/services/api';
import { uuidv4 } from 'renderer/helpers/uuid';
import { log } from 'renderer/services/log';
import { useBoardSocket } from './useBoardSocket';

type PrintingLayoutOptions = 'billing-content' | 'content';

type Response = {
  content: string;
  copies: number;
  device_name: string | null;
};

export function usePrintingBoard(): void {
  const { socket } = useBoardSocket();

  const print = useCallback(async (session: BoardControlMovement, layout: PrintingLayoutOptions) => {
    let logged = false;

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
            log.error('board print failed', err, { boardSessionId: session.id, layout, printer: payload.device_name });
            throw err;
          })
      );

      await Promise.all(promises);
    } catch (err) {
      if (!logged) {
        log.error('board print failed before reaching the printer', err, { boardSessionId: session.id, layout });
      }
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
