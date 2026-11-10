import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from 'renderer/providers/auth';
import { SocketStore } from 'renderer/services/socket-store';

const store = new SocketStore('admin');

export function useAdminSocket() {
  const { restaurant } = useAuth();

  useEffect(() => {
    if (restaurant) {
      store.connect(restaurant.uuid);
    }
  }, [restaurant]);

  useEffect(() => {
    return () => {
      store.disconnect();
    };
  }, []);

  return useSyncExternalStore(
    store.subscribe.bind(store),
    store.getSnapshot.bind(store),
    store.getSnapshot.bind(store)
  );
}
