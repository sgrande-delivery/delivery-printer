import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AppShell from 'renderer/components/layout/AppShell';
import StateLayout from 'renderer/components/layout/StateLayout';
import InsideLoading from 'renderer/components/loading/InsideLoading';
import NoConnection from 'renderer/components/connection/NoConnection';
import { useAuth } from 'renderer/providers/auth';

// A layout route: the six screens are its children, so the AppShell (and the socket hooks it owns)
// stays mounted while the operator navigates. One ProtectedRoute per screen would remount it each time.
const ProtectedRoute: React.FC = () => {
  const { sessionStatus, retrySession } = useAuth();

  if (sessionStatus === 'loading') {
    return (
      <StateLayout>
        <InsideLoading />
      </StateLayout>
    );
  }

  if (sessionStatus === 'unreachable') {
    return (
      <StateLayout>
        <NoConnection onRetry={retrySession} />
      </StateLayout>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
};

export default ProtectedRoute;
