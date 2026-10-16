import { render, screen } from '@testing-library/react';
import Login from '../renderer/components/login/Login';
import Status from '../renderer/components/status/Status';
import MessagingProvider from '../renderer/providers/messaging';
import AuthProvider from '../renderer/providers/auth';
import { expectNoUndefinedClasses } from '../renderer/__tests__/cssModules';

describe('Login', () => {
  it('renders the e-mail step with styled classes', () => {
    const { container } = render(
      <AuthProvider>
        <MessagingProvider>
          <Login />
        </MessagingProvider>
      </AuthProvider>
    );

    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite o seu e-mail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });
});

describe('Status', () => {
  it('renders the version with the real architecture', () => {
    const { container } = render(
      <AuthProvider>
        <Status wsConnected handleLogout={() => undefined} />
      </AuthProvider>
    );

    expect(screen.getByText(/^v\d+\.\d+\.\d+ - /)).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });
});
