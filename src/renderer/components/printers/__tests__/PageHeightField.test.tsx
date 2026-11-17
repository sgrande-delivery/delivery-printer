import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import MessagingProvider from 'renderer/providers/messaging';
import UsefulWidthSection from '../UsefulWidthSection';
import styles from '../PageHeightField.module.css';

const SWITCH = { name: 'Ajustar a altura da página' };

const found: ResolvedPrinter = {
  id: 3,
  name: 'Cozinha',
  address: 'Rua A, 1',
  activated: true,
  station: 'kitchen',
  paper_width: 80,
  copies: 1,
  resolvedDevice: 'EPSON TM-T20',
};

// usefulWidthMm defaults to a saved width: without one the field is not on screen at all, and that is its
// own test. Destructured defaults, not `??`: null is a value here, and `?? 72` would swallow it.
function renderSection(
  { usefulWidthMm = 72, pageHeightMm = null }: { usefulWidthMm?: number | null; pageHeightMm?: number | null } = {},
  onPageHeightChange = vi.fn().mockResolvedValue(undefined)
): { onPageHeightChange: typeof onPageHeightChange; container: HTMLElement } {
  const { container } = render(
    <MessagingProvider>
      <UsefulWidthSection
        printer={found}
        usefulWidthMm={usefulWidthMm}
        pageHeightMm={pageHeightMm}
        onChange={vi.fn().mockResolvedValue(undefined)}
        onPageHeightChange={onPageHeightChange}
      />
    </MessagingProvider>
  );

  return { onPageHeightChange, container };
}

describe('PageHeightField', () => {
  // Spec 101, RN-01: sem largura ajustada não há geometria explícita, e a altura não teria efeito nenhum.
  it('is not on screen while the useful width is automatic', () => {
    renderSection({ usefulWidthMm: null });

    expect(screen.queryByRole('switch', SWITCH)).not.toBeInTheDocument();
    expect(screen.queryByText(/altura do papel que o driver informa/)).not.toBeInTheDocument();
  });

  it('says the height is automatic and offers no stepper while nothing is saved', () => {
    renderSection();

    expect(screen.getByRole('switch', SWITCH)).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Automática: o app usa a altura do papel que o driver informa/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aumentar Altura da página' })).not.toBeInTheDocument();
  });

  it('saves the default height when the switch goes on', async () => {
    const { onPageHeightChange } = renderSection();

    fireEvent.click(screen.getByRole('switch', SWITCH));

    await waitFor(() => expect(onPageHeightChange).toHaveBeenCalledWith('EPSON TM-T20', 297));
  });

  it('removes the height when the switch goes off', async () => {
    const { onPageHeightChange } = renderSection({ pageHeightMm: 3000 });

    fireEvent.click(screen.getByRole('switch', SWITCH));

    await waitFor(() => expect(onPageHeightChange).toHaveBeenCalledWith('EPSON TM-T20', null));
  });

  it('steps 100 mm at a time and shows the cut the operator will see', async () => {
    const { onPageHeightChange } = renderSection({ pageHeightMm: 1000 });

    expect(
      screen.getByText('O comprovante é cortado a cada 100 cm quando o driver corta por página.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Altura da página' }));

    await waitFor(() => expect(onPageHeightChange).toHaveBeenCalledWith('EPSON TM-T20', 1100));
  });

  // A faixa é 297–3000: o Stepper não deixa a tela sair dela, e o main recusaria de todo jeito.
  it('does not step out of the range', () => {
    renderSection({ pageHeightMm: 3000 });

    expect(screen.getByRole('button', { name: 'Aumentar Altura da página' })).toBeDisabled();
  });

  it('says it when the channel refuses the height', async () => {
    const onPageHeightChange = vi.fn().mockRejectedValue(new Error('no useful width'));

    renderSection({ pageHeightMm: 1000 }, onPageHeightChange);
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Altura da página' }));

    expect(await screen.findByText('Não foi possível salvar a altura da página neste computador.')).toBeInTheDocument();
  });

  it('carries the layout classes of each block', () => {
    const { container } = renderSection({ pageHeightMm: 1000 });

    expect(container.querySelector(`.${styles.root}`)).toBeInTheDocument();
    expect(screen.getByRole('switch', SWITCH).parentElement).toHaveClass(styles.row);
    expect(screen.getByText('Ajustar a altura da página').parentElement).toHaveClass(styles.rowText);
  });
});
