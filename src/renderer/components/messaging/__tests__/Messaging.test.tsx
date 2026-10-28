import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import MessagingProvider, { useMessaging } from 'renderer/providers/messaging';
import styles from '../Messaging.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import InsideLoading from 'renderer/components/loading/InsideLoading';
import loadingStyles from 'renderer/components/loading/InsideLoading.module.css';
import spinnerStyles from 'renderer/base/Spinner.module.css';

const Opener: React.FC = () => {
  const { handleOpen } = useMessaging();

  return (
    <>
      <button onClick={() => handleOpen('Salvo com sucesso')}>abrir</button>
      <button onClick={() => handleOpen('Desfazer isto', () => undefined)}>abrir com ação</button>
    </>
  );
};

function renderOpener() {
  return render(
    <MessagingProvider>
      <Opener />
    </MessagingProvider>
  );
}

describe('Messaging', () => {
  it('shows the message and removes it on Fechar', () => {
    const { container } = renderOpener();
    expect(screen.queryByText('Salvo com sucesso')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'abrir' }));

    const message = screen.getByText('Salvo com sucesso');
    expect(message).toHaveClass(styles.message);
    expect(message.parentElement).toHaveClass(styles.content);
    expect(message.parentElement?.parentElement).toHaveClass(styles.snackbar);
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass(styles.actionText);
    expectNoUndefinedClasses(container);

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByText('Salvo com sucesso')).not.toBeInTheDocument();
  });

  it('hides by itself after the auto-hide time', () => {
    vi.useFakeTimers();
    try {
      renderOpener();
      fireEvent.click(screen.getByRole('button', { name: 'abrir' }));
      expect(screen.getByText('Salvo com sucesso')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.queryByText('Salvo com sucesso')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers Desfazer instead of Fechar when there is an action', () => {
    renderOpener();

    fireEvent.click(screen.getByRole('button', { name: 'abrir com ação' }));

    expect(screen.getByRole('button', { name: 'Desfazer' })).toHaveClass(styles.actionText);
    expect(screen.queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument();
  });
});

describe('InsideLoading', () => {
  it('shows the ring and the connecting text', () => {
    const { container } = render(<InsideLoading />);

    expect(screen.getByText('Conectando ao servidor…')).toHaveClass(loadingStyles.message);
    expect(screen.getByRole('progressbar', { name: 'carregando' })).toHaveClass(spinnerStyles.root, 'spin');
    expect(screen.getByRole('progressbar').parentElement).toHaveClass(loadingStyles.container);
    expectNoUndefinedClasses(container);
  });
});
