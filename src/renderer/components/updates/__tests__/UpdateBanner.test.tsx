import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import UpdateBanner from '../UpdateBanner';
import styles from '../UpdateBanner.module.css';

describe('UpdateBanner', () => {
  it('says the version and the fallback, and calls only the button that was clicked', () => {
    const onDismiss = vi.fn();
    const onRestart = vi.fn();
    const { container } = render(<UpdateBanner version="3.1.0" onDismiss={onDismiss} onRestart={onRestart} />);

    const banner = screen.getByRole('status', { name: 'Aviso de atualização pronta' });
    expect(banner).toHaveTextContent('A versão 3.1.0 está pronta para instalar');
    expect(banner).toHaveTextContent('Se você não reiniciar agora, ela é instalada quando o app for fechado.');

    fireEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRestart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar agora' }));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    expectNoUndefinedClasses(container);
  });

  it('keeps one class per element that carries layout', () => {
    render(<UpdateBanner version="3.1.0" onDismiss={vi.fn()} onRestart={vi.fn()} />);

    const title = screen.getByText('A versão 3.1.0 está pronta para instalar');
    expect(screen.getByRole('status')).toHaveClass(styles.root);
    expect(screen.getByText('restart_alt')).toHaveClass(styles.icon);
    expect(title.parentElement).toHaveClass(styles.texts);
    expect(title).toHaveClass(styles.title);
    expect(screen.getByText(/Se você não reiniciar/)).toHaveClass(styles.hint);
  });
});
