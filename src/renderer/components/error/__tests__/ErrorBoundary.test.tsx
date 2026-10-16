import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../ErrorBoundary';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

const Bomb: React.FC = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  const originalLocation = window.location;
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
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('shows the failure screen instead of the tree when a child throws on render', () => {
    const { container } = render(
      <ErrorBoundary>
        <p>conteudo</p>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('Algo deu errado')).toBeInTheDocument();
    expect(screen.queryByText('conteudo')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('sends the render error to the log, not to the console', () => {
    vi.mocked(window.electron.log).mockClear();

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(window.electron.log).toHaveBeenCalledWith(
      'error',
      'render error',
      expect.objectContaining({
        componentStack: expect.any(String),
        error: expect.objectContaining({ message: 'boom' }),
      })
    );
  });

  it('renders children untouched when nothing throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <p>conteudo</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('conteudo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.firstElementChild?.tagName).toBe('P');
  });

  it('reloads the window when the button is clicked', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } });

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
