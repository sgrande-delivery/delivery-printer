import React, { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import DefaultLayout from 'renderer/components/layout/DefaultLayout';
import InsideLoading from 'renderer/components/loading/InsideLoading';
import NoConnection from 'renderer/components/connection/NoConnection';
import { useAuth } from 'renderer/providers/auth';

interface ProtectedRouteProps {
  element: ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ element }) => {
  const { sessionStatus, retrySession } = useAuth();

  if (sessionStatus === 'loading') {
    return (
      <DefaultLayout>
        <InsideLoading />
      </DefaultLayout>
    );
  }

  if (sessionStatus === 'unreachable') {
    return (
      <DefaultLayout>
        <NoConnection onRetry={retrySession} />
      </DefaultLayout>
    );
  }

  if (sessionStatus === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <DefaultLayout>{element}</DefaultLayout>;
};

export default ProtectedRoute;
