import React from 'react';
import { useAuth } from 'renderer/providers/auth';
import Status from '../status/Status';
import { history } from 'renderer/services/history';
import { useAdminSocketEvents } from 'renderer/hooks/useAdminSocketEvents';
import InsideLoading from '../loading/InsideLoading';
import { usePrintingOrder } from 'renderer/hooks/usePrintingOrder';
import { usePrintingBoard } from 'renderer/hooks/usePrintingBoard';
import { useAdminSocket } from 'renderer/hooks/useAdminSocket';
import styles from './Main.module.css';

const Home: React.FC = () => {
  const auth = useAuth();

  useAdminSocketEvents();
  const { isConnected } = useAdminSocket();

  usePrintingOrder();
  usePrintingBoard();

  function handleLogout() {
    auth.logout().then(() => {
      history.push('/login');
    });
  }

  if (auth.loading) {
    return <InsideLoading />;
  }

  return (
    <>
      <div className={styles.titleBar}>
        <span>sgrande delivery printer</span>
      </div>
      <Status wsConnected={isConnected} handleLogout={handleLogout} />
    </>
  );
};

export default Home;
