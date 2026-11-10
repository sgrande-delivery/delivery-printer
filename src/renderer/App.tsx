import React from 'react';
import Routes from './routes/Routes';
import AuthProvider from './providers/auth';
import MessagingProvider from './providers/messaging';
import ThemeProvider from './providers/theme';
import ErrorBoundary from './components/error/ErrorBoundary';
import { BrowserRouter } from './routes/BrowserRouter';
import { history } from './services/history';

const App: React.FC = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <BrowserRouter history={history}>
        <AuthProvider>
          <MessagingProvider>
            <Routes />
          </MessagingProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
