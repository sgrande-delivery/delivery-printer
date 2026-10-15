import { useEffect } from 'react';
import { useAuth } from 'renderer/providers/auth';
import packageJson from '../../../package.json';
import { useAdminSocket } from './useAdminSocket';

type PrinterExitedAck = { event: string; message: 'OK' | 'IGNORED' };

let timer: NodeJS.Timeout;

export function useAdminSocketEvents(): void {
  const { restaurant, setRestaurantIsOpen } = useAuth();
  const { socket, isConnected } = useAdminSocket();

  useEffect(() => {
    socket?.on('handleRestaurantState', (response: { isOpen: boolean }) => {
      setRestaurantIsOpen(response.isOpen);
    });

    socket?.on('admin_ping', () => {
      socket?.emit('printer_ping', {
        restaurant_id: restaurant?.uuid,
        version: packageJson.version,
      });
    });

    return () => {
      socket?.off('handleRestaurantState');
      socket?.off('admin_ping');
    };
  }, [restaurant, setRestaurantIsOpen, socket]);

  useEffect(() => {
    if (!restaurant) {
      return;
    }

    return window.electron.onBeforeQuit(() => {
      // The gateway compares the raw uuid with the one from the handshake; an
      // object makes it answer IGNORED without any visible error.
      // The ack is the gateway's return value; the main process keeps its own
      // timeout for a dead socket, so quitting never depends on this callback.
      socket?.emit('printer_exited', restaurant.uuid, (ack?: PrinterExitedAck) => {
        if (ack?.message === 'IGNORED') {
          console.error('O servidor recusou o printer_exited (IGNORED): o restaurante não casa com a sala do socket.');
        }
        window.electron.beforeQuitDone();
      });
    });
  }, [restaurant, socket]);

  useEffect(() => {
    if (restaurant && isConnected) {
      socket?.emit('printer_ping', {
        restaurant_id: restaurant.id,
        restaurant_uuid: restaurant.uuid,
        version: packageJson.version,
      });

      timer = setInterval(() => {
        socket?.emit('printer_ping', {
          restaurant_id: restaurant.id,
          restaurant_uuid: restaurant.uuid,
          version: packageJson.version,
        });
      }, 30000);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [isConnected, restaurant, socket]);
}
