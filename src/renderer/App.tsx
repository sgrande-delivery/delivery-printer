import React from 'react';
import Routes from './routes/Routes';
import AuthProvider from './providers/auth';
import MessagingProvider from './providers/messaging';
import ErrorBoundary from './components/error/ErrorBoundary';
import { BrowserRouter } from './routes/BrowserRouter';
import { history } from './services/history';

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter history={history}>
      <AuthProvider>
        <MessagingProvider>
          <Routes />
        </MessagingProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
