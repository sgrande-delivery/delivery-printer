import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from 'renderer/App';

// A provider that blows up while rendering: it only reaches the failure screen if
// the boundary sits ABOVE the providers in App. Mocked at module level because
// the subject here is the position in the tree, not the boundary itself.
vi.mock('renderer/providers/auth', () => ({
  default: (): never => {
    throw new Error('auth provider exploded on render');
  },
  useAuth: () => ({}),
}));

describe('App error boundary position', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  // React rethrows the render error to window in dev; jsdom would print it as uncaught.
  const swallowWindowError = (event: ErrorEvent): void => event.preventDefault();

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    window.addEventListener('error', swallowWindowError);
  });

  afterEach(() => {
    consoleError.mockRestore();
    window.removeEventListener('error', swallowWindowError);
  });

  it('catches an error thrown by a provider, not only by a screen', () => {
    render(<App />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });
});
