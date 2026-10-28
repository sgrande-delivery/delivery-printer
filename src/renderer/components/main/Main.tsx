import React from 'react';
import Status from '../status/Status';
import { useLogout } from 'renderer/hooks/useLogout';
import { useShellConnection } from '../layout/shellConnection';

// The socket and printing hooks are NOT here: they live in the AppShell, which stays mounted across
// routes. Mounting one of them in a screen makes the screen's unmount disconnect the shared store.
const Home: React.FC = () => {
  const logout = useLogout();
  const isConnected = useShellConnection();

  return <Status wsConnected={isConnected} handleLogout={logout} />;
};

export default Home;
