import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import NoConnection from '../NoConnection';
import styles from '../NoConnection.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import iconStyles from 'renderer/base/Icon.module.css';
import constants from 'constants/constants';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

function tick(seconds: number): void {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe('NoConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('explains the failure, that the session is kept, and shows the address', () => {
    const { container } = render(<NoConnection onRetry={vi.fn()} />);

    expect(screen.getByText('Sem conexão com o servidor')).toBeInTheDocument();
    expect(screen.getByText('Você continua conectado à sua conta — não é preciso entrar de novo.')).toBeInTheDocument();
    expect(screen.getByText(constants.BASE_URL)).toBeInTheDocument();
    expect(screen.getByText(constants.BASE_URL).tagName).toBe('CODE');
    expect(screen.getByRole('alert')).toHaveClass(styles.container);
    expect(screen.getByText(/Enquanto não houver conexão/)).toHaveClass(styles.body);
    expect(screen.getByText(/Você continua conectado/)).toHaveClass(styles.session);
    expect(screen.getByRole('button', { name: 'Tentar novamente' }).parentElement).toHaveClass(styles.actions);
    expect(screen.getByText(constants.BASE_URL)).toHaveClass(styles.address);
    expect(screen.getByText('Sem conexão com o servidor')).toHaveClass(styles.title);
    expect(screen.getByText('cloud_off').parentElement).toHaveClass(styles.badge);
    expect(screen.getByText('cloud_off')).toHaveClass(iconStyles.root);
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveClass(buttonStyles.action);
    expect(screen.getByText(/nova tentativa em/)).toHaveClass(styles.countdown);
    expectNoUndefinedClasses(container);
  });

  it('counts down every second from 12', () => {
    render(<NoConnection onRetry={vi.fn()} />);

    expect(screen.getByText('nova tentativa em 12 s')).toBeInTheDocument();
    tick(3);
    expect(screen.getByText('nova tentativa em 9 s')).toBeInTheDocument();
  });

  it('retries by itself when the counter reaches zero, and starts over at 12', () => {
    const onRetry = vi.fn();
    render(<NoConnection onRetry={onRetry} />);

    tick(11);
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByText('nova tentativa em 1 s')).toBeInTheDocument();

    tick(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('nova tentativa em 12 s')).toBeInTheDocument();

    tick(12);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('retries at once on click and restarts the counter, without a second automatic call', () => {
    const onRetry = vi.fn();
    render(<NoConnection onRetry={onRetry} />);

    tick(7);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('nova tentativa em 12 s')).toBeInTheDocument();

    tick(11);
    expect(onRetry).toHaveBeenCalledTimes(1);
    tick(1);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('stops the interval on unmount: time passing afterwards calls nothing', () => {
    const onRetry = vi.fn();
    const { unmount } = render(<NoConnection onRetry={onRetry} />);

    tick(5);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    tick(60);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('calls the latest onRetry, not the one from the first render', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<NoConnection onRetry={first} />);

    rerender(<NoConnection onRetry={second} />);
    tick(12);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
