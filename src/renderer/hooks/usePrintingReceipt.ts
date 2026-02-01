import { useCallback, useEffect } from 'react';
import constants from 'constants/constants';
import { api } from 'renderer/services/api';
import { uuidv4 } from 'renderer/helpers/uuid';
import { useReceiptSocket } from './useReceiptSocket';

type Response = {
  content: string;
};

type PrintNfcePayloadEvent = {
  content: string;
  type: string;
  restaurant_uuid: string;
  restaurant_id: number;
};

export function usePrintingReceipt(): void {
  const { socket } = useReceiptSocket();

  const print = useCallback(async (payload: PrintNfcePayloadEvent) => {
    try {
      window.electron.pdfPrint({
        content: payload.content,
        id: uuidv4(),
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    socket?.on('print_nfce_receipt', (payload: PrintNfcePayloadEvent) => {
      console.log('Printing receipt', payload);
      print(payload);
    });

    return () => {
      socket?.off('print_nfce_receipt');
    };
  }, [print, socket]);
}
