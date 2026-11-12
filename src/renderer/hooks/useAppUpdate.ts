import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import type { UpdateState } from 'shared/appUpdate';
import type { AppUpdateContextValue } from 'renderer/components/layout/appUpdateContext';

// Mounted once, by the AppShell. The state is a drawing of what the main process keeps.
export function useAppUpdate(): AppUpdateContextValue {
  const { handleOpen: open } = useMessaging();
  // Through a ref: the subscription below must not be redone because the messaging value changed identity.
  // handleOpen must NOT go back into any dependency array of an effect here -- it changes identity on every
  // toast, and the effect would resubscribe and re-read on every render, forever. The guard is the last
  // describe of hooks/__tests__/useAppUpdate.test.ts.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const handleOpen = useCallback((message: string): void => openRef.current(message), []);
  const [state, setState] = useState<UpdateState | null>(null);
  // Set by the operator's click on "Verificar agora" and by nothing else: the checks of the boot and of the
  // 6 h cycle run in the main process and never pass through here, so they can never ask for the notice.
  // `from` is the lastCheckedAt of the click; the check ended with no news when it moved and the status is idle.
  const manualCheck = useRef<{ from: number | null } | null>(null);
  const lastCheckedAt = useRef<number | null>(null);

  const adopt = useCallback(
    (next: UpdateState): void => {
      const request = manualCheck.current;

      if (request !== null && next.status !== 'checking') {
        manualCheck.current = null;

        if (next.status === 'idle' && next.lastCheckedAt !== null && next.lastCheckedAt !== request.from) {
          handleOpen('Você já está na versão mais recente.');
        }
      }

      lastCheckedAt.current = next.lastCheckedAt;
      setState(next);
    },
    [handleOpen]
  );

  useEffect(() => {
    // An event that lands before the first read answers is newer than that answer.
    let received = false;

    const off = window.electron.onUpdateChanged(next => {
      received = true;
      adopt(next);
    });

    window.electron
      .updateState()
      .then(initial => {
        if (!received) {
          adopt(initial);
        }
      })
      .catch((err: unknown) => {
        log.error('read update state failed', err);
      });

    return off;
  }, [adopt]);

  const run = useCallback(
    async (action: () => Promise<UpdateState>, what: string, message: string): Promise<UpdateState | null> => {
      try {
        const next = await action();
        adopt(next);

        return next;
      } catch (err: unknown) {
        log.error(what, err);
        handleOpen(message);

        return null;
      }
    },
    [adopt, handleOpen]
  );

  const check = useCallback(async (): Promise<void> => {
    manualCheck.current = { from: lastCheckedAt.current };

    const next = await run(
      () => window.electron.checkForUpdate(),
      'check for update failed',
      'Não foi possível verificar atualizações.'
    );

    if (next === null) {
      manualCheck.current = null;
    }
  }, [run]);

  const download = useCallback(async (): Promise<void> => {
    await run(
      () => window.electron.downloadUpdate(),
      'download update failed',
      'Não foi possível baixar a atualização.'
    );
  }, [run]);

  const setAutoDownload = useCallback(
    async (value: boolean): Promise<void> => {
      await run(
        () => window.electron.setAutoDownloadUpdates(value),
        'save auto download failed',
        'Não foi possível salvar a preferência de atualização.'
      );
    },
    [run]
  );

  const restart = useCallback(async (): Promise<void> => {
    await run(
      () => window.electron.restartToUpdate(),
      'restart to update failed',
      'Não foi possível reiniciar para atualizar.'
    );
  }, [run]);

  const cancelRestart = useCallback(async (): Promise<void> => {
    const next = await run(
      () => window.electron.cancelRestart(),
      'cancel restart failed',
      'Não foi possível cancelar o reinício.'
    );

    // The main answers a cancel outside the scheduled state with the state unchanged: no notice for a no-op.
    if (next !== null && next.status === 'ready' && !next.restartScheduled) {
      handleOpen('Reinício cancelado. A atualização será instalada ao fechar o app.');
    }
  }, [run, handleOpen]);

  // The AppShell re-renders on every navigation, and this value is the context every consumer reads:
  // without the memo they would all re-render when nothing about the update changed. The state itself
  // changes often enough on its own -- 'download-progress' fires dozens of times per download.
  return useMemo(
    () => ({ state, check, download, setAutoDownload, restart, cancelRestart }),
    [state, check, download, setAutoDownload, restart, cancelRestart]
  );
}
