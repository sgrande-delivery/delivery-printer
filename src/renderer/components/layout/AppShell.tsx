import React, { ReactNode, useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminSocketEvents } from 'renderer/hooks/useAdminSocketEvents';
import { useAdminSocket } from 'renderer/hooks/useAdminSocket';
import { usePrintingOrder } from 'renderer/hooks/usePrintingOrder';
import { usePrintingBoard } from 'renderer/hooks/usePrintingBoard';
import { useAppUpdate } from 'renderer/hooks/useAppUpdate';
import Chip from 'renderer/base/Chip';
import RestartDialog from 'renderer/components/updates/RestartDialog';
import RestartingOverlay from 'renderer/components/updates/RestartingOverlay';
import UpdateBanner from 'renderer/components/updates/UpdateBanner';
import Sidebar from './Sidebar';
import { titleFor } from './navigation';
import { ShellConnectionContext } from './shellConnection';
import { AppUpdateContext } from './appUpdateContext';
import { RestartDialogContext } from './restartDialogContext';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
}

// The single owner of the socket and printing hooks (spec 38, RN-06). They live above the routes so
// that navigating never unmounts them: the cleanup of the socket hooks disconnects the store.
const AppShell: React.FC<AppShellProps> = ({ children }) => {
  useAdminSocketEvents();
  const { isConnected } = useAdminSocket();
  usePrintingOrder();
  usePrintingBoard();
  const appUpdate = useAppUpdate();

  const { pathname } = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  // The version whose banner the operator dismissed. Keyed by version, so a newer one shows again (RN-12);
  // it is session memory on purpose: persisting it would hide the update for good.
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const { state } = appUpdate;
  const target = state?.targetVersion ?? null;
  const ready = state?.status === 'ready' && target !== null;
  const showBanner = ready && !state.restartScheduled && dismissedVersion !== target && pathname !== '/updates';
  const showDialog = dialogOpen && ready && !state.restartScheduled;
  const restarting = state?.status === 'restarting';

  const openRestartDialog = useCallback(() => setDialogOpen(true), []);
  const restartDialog = useMemo(() => ({ openRestartDialog }), [openRestartDialog]);

  function confirmRestart(): void {
    setDialogOpen(false);
    void appUpdate.restart();
  }

  return (
    <ShellConnectionContext.Provider value={isConnected}>
      <AppUpdateContext.Provider value={appUpdate}>
        <RestartDialogContext.Provider value={restartDialog}>
          <div className={styles.root}>
            <Sidebar isConnected={isConnected} />
            <main className={styles.main}>
              <header className={styles.header}>
                <h1 className={styles.title}>{titleFor(pathname)}</h1>
                <Chip size="small" tone={isConnected ? 'ok' : 'err'} dot={isConnected ? 'ok' : 'err'}>
                  {isConnected ? 'Online' : 'Sem conexão'}
                </Chip>
              </header>
              <div id="app-content" className={styles.content}>
                {showBanner && (
                  <UpdateBanner
                    version={target}
                    onDismiss={() => setDismissedVersion(target)}
                    onRestart={openRestartDialog}
                  />
                )}
                {children}
              </div>
            </main>
          </div>
          {showDialog && (
            <RestartDialog
              version={target}
              pendingJobs={state.pendingJobs}
              onCancel={() => setDialogOpen(false)}
              onConfirm={confirmRestart}
            />
          )}
          {restarting && <RestartingOverlay version={target} />}
        </RestartDialogContext.Provider>
      </AppUpdateContext.Provider>
    </ShellConnectionContext.Provider>
  );
};

export default AppShell;
