import React, { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminSocketEvents } from 'renderer/hooks/useAdminSocketEvents';
import { useAdminSocket } from 'renderer/hooks/useAdminSocket';
import { usePrintingOrder } from 'renderer/hooks/usePrintingOrder';
import { usePrintingBoard } from 'renderer/hooks/usePrintingBoard';
import Sidebar from './Sidebar';
import { titleFor } from './navigation';
import { ShellConnectionContext } from './shellConnection';
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

  const { pathname } = useLocation();

  return (
    <ShellConnectionContext.Provider value={isConnected}>
      <div className={styles.root}>
        <Sidebar isConnected={isConnected} />
        <main className={styles.main}>
          <header className={styles.header}>
            <h1 className={styles.title}>{titleFor(pathname)}</h1>
            <span className={isConnected ? styles.chipOnline : styles.chipOffline}>
              <span className={styles.chipDot} />
              {isConnected ? 'Online' : 'Sem conexão'}
            </span>
          </header>
          <div id="app-content" className={styles.content}>
            {children}
          </div>
        </main>
      </div>
    </ShellConnectionContext.Provider>
  );
};

export default AppShell;
