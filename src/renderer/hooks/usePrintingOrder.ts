import { useCallback, useEffect, useRef } from 'react';
import { OrderData } from 'renderer/types/order';
import { api } from 'renderer/services/api';
import { uuidv4 } from 'renderer/helpers/uuid';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { useOrderSocket } from './useOrderSocket';

type PrintingLayoutOptions = 'print-created' | 'print-dispatched';

type Response = {
  content: string;
  copies: number;
  device_name: string | null;
};

export function usePrintingOrder(): void {
  const { socket, isConnected } = useOrderSocket();

  const { handleOpen } = useMessaging();

  // handleOpen muda de identidade quando o snackbar abre; fora das dependências de print
  // para que abrir o aviso não refaça a varredura nem os listeners.
  const handleOpenRef = useRef(handleOpen);

  useEffect(() => {
    handleOpenRef.current = handleOpen;
  }, [handleOpen]);

  // Defesa provisória e só em memória: uuids cujo comprovante de produção (print-created, o único
  // layout que a varredura pede) já saiu nesta sessão, para a varredura não reimprimir quando o
  // PATCH de impresso falhou. Morre no restart; a spec #15 (task #17) troca isto pela
  // deduplicação em disco.
  const printedRef = useRef<Set<string>>(new Set());

  const print = useCallback(async (order: Pick<OrderData, 'uuid' | 'sequence'>, layout: PrintingLayoutOptions) => {
    const { uuid, sequence } = order;

    // Quem falha em rawPrint já registra com a impressora; o catch de fora só registra o resto
    // (a busca do HTML), para a mesma falha não entrar duas vezes no arquivo.
    let logged = false;

    try {
      const response = await api.get<Response[]>(`orders/${uuid}/${layout}`);

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
            log.error('print failed', err, { orderUuid: uuid, sequence, layout, printer: payload.device_name });
            throw err;
          })
      );

      await Promise.all(promises);
    } catch (err) {
      // Não saiu: a API segue achando que falta imprimir e a varredura tenta de novo.
      if (!logged) {
        log.error('print failed before reaching the printer', err, { orderUuid: uuid, sequence, layout });
      }
      return;
    }

    // Só o layout que a varredura reimprimiria entra na guarda: ela sempre pede print-created,
    // então registrar o print-dispatched aqui esconderia da varredura um print-created que falhou.
    if (layout === 'print-created') {
      printedRef.current.add(uuid);
    }

    try {
      await api.patch(`/orders/${uuid}/printed`);
    } catch (err) {
      // Saiu, mas não foi marcado: a próxima varredura reimprimiria. O operador precisa saber.
      log.error('printed mark failed', err, { orderUuid: uuid, sequence });
      handleOpenRef.current(
        `O pedido #${sequence} foi impresso, mas não foi possível marcá-lo como impresso. Ele pode sair novamente.`
      );
    }
  }, []);

  useEffect(() => {
    socket?.on('printOrder', (order: OrderData) => {
      print(order, 'print-created');
    });

    socket?.on('printShipment', (order: OrderData) => {
      print(order, 'print-dispatched');
    });

    return () => {
      socket?.off('printShipment');
      socket?.off('printOrder');
    };
  }, [print, socket]);

  useEffect(() => {
    async function findOrders() {
      try {
        const response = await api.get<OrderData[]>('/orders/print/list');
        await Promise.all(
          response.data.filter(order => !printedRef.current.has(order.uuid)).map(order => print(order, 'print-created'))
        );
      } catch (err) {
        log.error('pending orders scan failed', err);
      }
    }

    if (isConnected) {
      findOrders();
    }
  }, [isConnected, print]);
}
