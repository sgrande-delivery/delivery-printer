import { useEffect, useSyncExternalStore } from 'react';
import { useSelector } from 'renderer/store/selector';
import { SocketStore } from 'renderer/store/socket-store';

const store = new SocketStore('receipt');

export function useReceiptSocket() {
  const restaurant = useSelector(state => state.restaurant);

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
