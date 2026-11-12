import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import type { UpdateState } from 'shared/appUpdate';
import type { AppUpdateContextValue } from 'renderer/components/layout/appUpdateContext';

// Mounted once, by the AppShell. The state is a drawing of what the main process keeps.
export function useAppUpdate(): AppUpdateContextValue {
  const { handleOpen } = useMessaging();
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    // An event that lands before the first read answers is newer than that answer.
    let received = false;

    const off = window.electron.onUpdateChanged(next => {
      received = true;
      setState(next);
    });

    window.electron
      .updateState()
      .then(initial => {
        if (!received) {
          setState(initial);
        }
      })
      .catch((err: unknown) => {
        log.error('read update state failed', err);
      });

    return off;
  }, []);

  const run = useCallback(
    async (action: () => Promise<UpdateState>, what: string, message: string): Promise<void> => {
      try {
        setState(await action());
      } catch (err: unknown) {
        log.error(what, err);
        handleOpen(message);
      }
    },
    [handleOpen]
  );

  const check = useCallback(
    () =>
      run(
        () => window.electron.checkForUpdate(),
        'check for update failed',
        'Não foi possível verificar atualizações.'
      ),
    [run]
  );

  const download = useCallback(
    () =>
      run(() => window.electron.downloadUpdate(), 'download update failed', 'Não foi possível baixar a atualização.'),
    [run]
  );

  const setAutoDownload = useCallback(
    (value: boolean) =>
      run(
        () => window.electron.setAutoDownloadUpdates(value),
        'save auto download failed',
        'Não foi possível salvar a preferência de atualização.'
      ),
    [run]
  );

  const restart = useCallback(
    () =>
      run(
        () => window.electron.restartToUpdate(),
        'restart to update failed',
        'Não foi possível reiniciar para atualizar.'
      ),
    [run]
  );

  const cancelRestart = useCallback(
    () => run(() => window.electron.cancelRestart(), 'cancel restart failed', 'Não foi possível cancelar o reinício.'),
    [run]
  );

  // The AppShell re-renders on every navigation, and this value is the context every consumer reads:
  // without the memo they would all re-render when nothing about the update changed. The state itself
  // changes often enough on its own -- 'download-progress' fires dozens of times per download.
  return useMemo(
    () => ({ state, check, download, setAutoDownload, restart, cancelRestart }),
    [state, check, download, setAutoDownload, restart, cancelRestart]
  );
}
