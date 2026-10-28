import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../ErrorBoundary';
import styles from '../ErrorBoundary.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
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

    expect(screen.getByText('Algo deu errado nesta tela')).toBeInTheDocument();
    expect(screen.queryByText('conteudo')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveClass(styles.container);
    expect(screen.getByRole('alert').parentElement).toHaveClass(styles.content);
    expect(screen.getByRole('alert').parentElement?.parentElement).toHaveClass(styles.root);
    // The bar carries the brand like the other two state screens (printer-v2.dc.html:470-476).
    expect(screen.getByAltText('SGrande')).toHaveClass(styles.symbol);
    expect(screen.getByAltText('SGrande').parentElement).toHaveClass(styles.bar);
    expect(screen.getByText('SGrande Delivery Printer')).toHaveClass(styles.name);
    expect(screen.getByText(/Ocorreu um erro inesperado/)).toHaveClass(styles.body);
    expect(screen.getByRole('button', { name: 'Recarregar' }).parentElement).toHaveClass(styles.actions);
    expect(screen.getByText('Algo deu errado nesta tela')).toHaveClass(styles.title);
    expect(screen.getByText('error').parentElement).toHaveClass(styles.badge);
    expect(screen.getByRole('button', { name: 'Abrir registros' })).toHaveClass(buttonStyles.outlined, buttonStyles.action);
    expect(screen.getByRole('button', { name: 'Recarregar' })).toHaveClass(
      buttonStyles.containedPrimary,
      buttonStyles.action
    );
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

  it('opens the logs folder from the failure screen', async () => {
    vi.mocked(window.electron.revealLogs).mockClear();
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir registros' }));

    await waitFor(() => expect(window.electron.revealLogs).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says so when there are no logs yet', async () => {
    vi.mocked(window.electron.revealLogs).mockResolvedValueOnce(false);
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir registros' }));

    expect(await screen.findByText('Ainda não há registros para exportar.')).toHaveClass(styles.notice);
  });

  it('says so when the logs folder cannot be opened', async () => {
    vi.mocked(window.electron.revealLogs).mockRejectedValueOnce(new Error('boom'));
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir registros' }));

    expect(await screen.findByText('Não foi possível abrir a pasta dos registros.')).toBeInTheDocument();
  });
});
