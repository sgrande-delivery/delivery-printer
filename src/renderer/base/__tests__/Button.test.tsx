import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Button from '../Button';
import styles from '../Button.module.css';
import type { ButtonHeight } from '../Button';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

describe('Button', () => {
  it('keeps the legacy square button for medium and small, with no inline metrics', () => {
    render(
      <>
        <Button variant="contained">Padrão</Button>
        <Button size="small">Pequeno</Button>
      </>
    );

    expect(screen.getByText('Padrão')).toHaveClass(styles.root, styles.containedPrimary);
    expect(screen.getByText('Padrão')).not.toHaveClass(styles.design);
    expect(screen.getByText('Padrão').getAttribute('style')).toBeNull();
    expect(screen.getByText('Pequeno')).toHaveClass(styles.small);
  });

  it.each<[ButtonHeight, string, string, string]>([
    [32, '6px', '13px', '0 12px'],
    [34, '6px', '13px', '0 14px'],
    [38, '6px', '13px', '0 18px'],
    [42, '8px', '14px', '0 20px'],
    [44, '8px', '14px', '0 22px'],
    [46, '8px', '15px', '0 16px'],
    [48, '8px', '15px', '0 28px'],
  ])('draws the %i px button with its radius, font and contained padding', (height, radius, fontSize, padding) => {
    render(
      <Button variant="contained" size={height}>
        Ação
      </Button>
    );

    const button = screen.getByText('Ação');
    expect(button).toHaveClass(styles.design, styles.containedPrimary);
    expect(button).toHaveStyle({ height: `${height}px`, borderRadius: radius, fontSize, padding, fontWeight: '600' });
  });

  it('takes the padding and weight from the variant too, as the design does', () => {
    render(
      <>
        <Button size={42} variant="outlined">
          Abrir registros
        </Button>
        <Button size={38} variant="text">
          Cancelar
        </Button>
        <Button size={34} variant="outlined">
          Editar
        </Button>
        <Button size={32} variant="text">
          Descartar
        </Button>
      </>
    );

    expect(screen.getByText('Abrir registros')).toHaveStyle({ padding: '0 18px', fontWeight: '400' });
    expect(screen.getByText('Cancelar')).toHaveStyle({ padding: '0 16px', fontWeight: '400' });
    expect(screen.getByText('Editar')).toHaveStyle({ padding: '0 14px', fontWeight: '600' });
    expect(screen.getByText('Descartar')).toHaveStyle({ padding: '0 10px' });
  });

  it('marks the quiet text button and the clear outline, and only for the sizes that have them', () => {
    render(
      <>
        <Button size={32} variant="text">
          Quieto
        </Button>
        <Button size={38} variant="text">
          Gaveta
        </Button>
        <Button size={34} variant="text">
          Comum
        </Button>
        <Button size={34} variant="outlined">
          Limpo
        </Button>
        <Button size={42} variant="outlined">
          Cheio
        </Button>
      </>
    );

    expect(screen.getByText('Quieto')).toHaveClass(styles.quiet);
    // The drawer's "Cancelar" and "Continuar editando": the design declares --text-2 for them (:431).
    expect(screen.getByText('Gaveta')).toHaveClass(styles.quiet);
    expect(screen.getByText('Comum')).not.toHaveClass(styles.quiet);
    expect(screen.getByText('Limpo')).toHaveClass(styles.outlined, styles.clearOutline);
    expect(screen.getByText('Cheio')).not.toHaveClass(styles.clearOutline);
  });

  it('adds the gap only to the 44 px button, which carries an icon', () => {
    render(
      <>
        <Button size={44}>Com ícone</Button>
        <Button size={46}>Sem ícone</Button>
      </>
    );

    expect(screen.getByText('Com ícone')).toHaveStyle({ gap: '8px' });
    expect(screen.getByText('Sem ícone').style.gap).toBe('');
  });

  it('lets a caller style win over the table and still defaults to type="button"', () => {
    render(
      <Button size={46} style={{ height: 50 }}>
        Ajustado
      </Button>
    );

    expect(screen.getByText('Ajustado')).toHaveStyle({ height: '50px' });
    expect(screen.getByText('Ajustado')).toHaveAttribute('type', 'button');
  });

  it('uses only classes that exist', () => {
    const { container } = render(
      <>
        <Button variant="contained" size={34} fullWidth>
          A
        </Button>
        <Button variant="outlined" size={34}>
          B
        </Button>
        <Button variant="text" size={32}>
          C
        </Button>
      </>
    );

    expectNoUndefinedClasses(container);
  });
});
