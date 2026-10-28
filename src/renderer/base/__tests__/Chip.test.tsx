import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Chip from '../Chip';
import styles from '../Chip.module.css';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('Chip', () => {
  it('is a span with the neutral large pill by default', () => {
    const { container } = render(<Chip>Cozinha</Chip>);

    const chip = screen.getByText('Cozinha');
    expect(chip.tagName).toBe('SPAN');
    expect(chip).toHaveClass(styles.root, styles.large, styles.neutral);
    expectNoUndefinedClasses(container);
  });

  it('carries the size and the tone of the design', () => {
    render(
      <Chip size="small" tone="err">
        Sem conexão
      </Chip>
    );

    expect(screen.getByText('Sem conexão')).toHaveClass(styles.small, styles.err);
    expect(screen.getByText('Sem conexão')).not.toHaveClass(styles.neutral);
  });

  it('draws the dot only when asked, in the color asked', () => {
    const { rerender } = render(<Chip>sem ponto</Chip>);
    expect(screen.getByText('sem ponto').firstElementChild).toBeNull();

    rerender(
      <Chip dot="muted" size="large">
        com ponto
      </Chip>
    );
    expect(screen.getByText('com ponto').firstElementChild).toHaveClass(styles.dot, styles.dotMuted);

    rerender(<Chip dot="ok">com ponto</Chip>);
    expect(screen.getByText('com ponto').firstElementChild).toHaveClass(styles.dotOk);

    rerender(<Chip dot="err">com ponto</Chip>);
    expect(screen.getByText('com ponto').firstElementChild).toHaveClass(styles.dotErr);
  });

  it('becomes a button, clickable and out of the drag region, when it has a handler', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>voltar</Chip>);

    const chip = screen.getByRole('button', { name: 'voltar' });
    expect(chip).toHaveClass(styles.clickable);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
