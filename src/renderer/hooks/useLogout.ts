import { useCallback } from 'react';
import { useAuth } from 'renderer/providers/auth';
import { useMessaging } from 'renderer/providers/messaging';
import { history } from 'renderer/services/history';
import { log } from 'renderer/services/log';

export function useLogout(): () => void {
  const { logout } = useAuth();
  const { handleOpen } = useMessaging();

  return useCallback((): void => {
    logout()
      .then(() => history.push('/login'))
      .catch((err: unknown) => {
        log.error('logout failed', err);
        handleOpen('Não foi possível desconectar. Tente novamente.');
      });
  }, [logout, handleOpen]);
}
