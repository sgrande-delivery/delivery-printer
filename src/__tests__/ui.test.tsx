import { render, screen } from '@testing-library/react';
import Login from '../renderer/components/login/Login';
import Status from '../renderer/components/status/Status';
import MessagingProvider from '../renderer/providers/messaging';
import AuthProvider from '../renderer/providers/auth';

/**
 * A misspelled CSS Modules key resolves to undefined and lands in the DOM as
 * class="undefined", silently losing the styling. These assert it never does.
 */
function expectNoUndefinedClasses(container: HTMLElement) {
  const broken = Array.from(container.querySelectorAll('*')).filter(el =>
    el.className?.toString().split(/\s+/).includes('undefined')
  );

  expect(broken.map(el => `${el.tagName}: ${el.className}`)).toEqual([]);
}

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
