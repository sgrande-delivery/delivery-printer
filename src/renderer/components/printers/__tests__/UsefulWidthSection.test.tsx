import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import MessagingProvider from 'renderer/providers/messaging';
import { TEST_PRINT_SCALE_TITLE } from 'shared/testPrintContent';
import UsefulWidthSection from '../UsefulWidthSection';
import styles from '../UsefulWidthSection.module.css';

// The Stepper is a group too: the question is found by its name.
const QUESTION = { name: /Qual o último número que saiu inteiro/ };

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

function renderSection(
  props: Partial<{ printer: ResolvedPrinter; usefulWidthMm: number | null }> = {},
  onChange = vi.fn().mockResolvedValue(undefined)
): { onChange: typeof onChange; container: HTMLElement } {
  const { container } = render(
    <MessagingProvider>
      <UsefulWidthSection
        printer={props.printer ?? found}
        usefulWidthMm={props.usefulWidthMm ?? null}
        onChange={onChange}
      />
    </MessagingProvider>
  );

  return { onChange, container };
}

describe('UsefulWidthSection', () => {
  beforeEach(() => {
    vi.mocked(window.electron.printTest).mockClear();
    vi.mocked(window.electron.printTest).mockResolvedValue('enqueued');
  });

  it('offers nothing to click when the Windows printer of the registration was not found', () => {
    renderSection({ printer: { ...found, resolvedDevice: null } });

    expect(screen.getByText(/Disponível quando a impressora do Windows/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says automatic and shows no stepper while nothing is saved', () => {
    renderSection();

    expect(screen.getByRole('switch', { name: 'Ajustar a largura útil' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Automática: o app usa a área que o driver/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aumentar Largura útil' })).not.toBeInTheDocument();
  });

  it.each([
    [80, 72],
    [58, 48],
  ])('turning it on for a %s mm roll saves %s for the resolved device', async (paper, expected) => {
    const { onChange } = renderSection({ printer: { ...found, paper_width: paper } });

    fireEvent.click(screen.getByRole('switch', { name: 'Ajustar a largura útil' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('EPSON TM-T20', expected));
  });

  it('turning it off goes back to automatic', async () => {
    const { onChange } = renderSection({ usefulWidthMm: 72 });

    fireEvent.click(screen.getByRole('switch', { name: 'Ajustar a largura útil' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('EPSON TM-T20', null));
  });

  it('the stepper saves each step', async () => {
    const { onChange } = renderSection({ usefulWidthMm: 72 });

    expect(screen.getByText('72 mm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Largura útil' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('EPSON TM-T20', 73));
  });

  it('cannot go past the range', () => {
    renderSection({ usefulWidthMm: 80 });

    expect(screen.getByRole('button', { name: 'Aumentar Largura útil' })).toBeDisabled();
  });

  it('measures: sends the measuring page, asks for the last mark of the scale and saves the answer as read', async () => {
    const { onChange } = renderSection({ usefulWidthMm: 72 });

    fireEvent.click(screen.getByRole('button', { name: 'Medir' }));

    const question = await screen.findByRole('group', {
      name: new RegExp(TEST_PRINT_SCALE_TITLE.replace(/[()]/g, '\\$&')),
    });
    expect(window.electron.printTest).toHaveBeenCalledWith({
      printerName: 'Cozinha',
      stationLabel: 'Cozinha',
      paperWidth: 80,
      deviceName: 'EPSON TM-T20',
      purpose: 'measure',
    });

    const marks = Array.from(question.querySelectorAll('button')).map(button => button.textContent);
    expect(marks).toEqual(['40', '45', '50', '55', '60', '65', '70', '75', '80', 'Cancelar']);

    fireEvent.click(screen.getByRole('button', { name: '70' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('EPSON TM-T20', 70));
    await waitFor(() => expect(screen.queryByRole('group', QUESTION)).not.toBeInTheDocument());
    expect(await screen.findByText(/Largura útil de 70 mm salva nesta máquina/)).toBeInTheDocument();
  });

  it('offers only the marks a 58 mm roll prints', async () => {
    renderSection({ printer: { ...found, paper_width: 58 } });

    fireEvent.click(screen.getByRole('button', { name: 'Medir' }));

    const question = await screen.findByRole('group', QUESTION);
    const marks = Array.from(question.querySelectorAll('button')).map(button => button.textContent);
    expect(marks).toEqual(['40', '45', '50', '55', 'Cancelar']);
  });

  it('keeps the question when the answer could not be saved, and says so', async () => {
    const onChange = vi.fn().mockRejectedValue(new Error('EPERM'));
    renderSection({}, onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Medir' }));
    fireEvent.click(await screen.findByRole('button', { name: '70' }));

    expect(await screen.findByText('Não foi possível salvar a largura útil neste computador.')).toBeInTheDocument();
    expect(screen.getByRole('group', QUESTION)).toBeInTheDocument();
  });

  it('does not ask when the measuring page could not be sent', async () => {
    vi.mocked(window.electron.printTest).mockRejectedValueOnce(new Error('invalid test print request'));
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Medir' }));

    expect(await screen.findByText(/Não foi possível enviar a página de medição/)).toBeInTheDocument();
    expect(screen.queryByRole('group', QUESTION)).not.toBeInTheDocument();
  });

  it('prints the ordinary test page to check, without measuring', async () => {
    renderSection({ usefulWidthMm: 72 });

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir teste' }));

    await waitFor(() =>
      expect(window.electron.printTest).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'check' }))
    );
    expect(screen.queryByRole('group', QUESTION)).not.toBeInTheDocument();
  });

  it('says the width belongs to the device on this computer, not to the server', () => {
    renderSection();

    expect(screen.getByText(/Vale para todo cadastro que usa “EPSON TM-T20” neste computador/)).toBeInTheDocument();
  });

  it('carries the layout classes of each block', async () => {
    const { container } = renderSection({ usefulWidthMm: 72 });

    fireEvent.click(screen.getByRole('button', { name: 'Medir' }));
    const question = await screen.findByRole('group', QUESTION);

    expect(container.querySelector('section')).toHaveClass(styles.root);
    expect(screen.getByRole('switch').parentElement).toHaveClass(styles.row);
    expect(screen.getByText('Ajustar a largura útil').parentElement).toHaveClass(styles.rowText);
    expect(screen.getByRole('button', { name: 'Medir' }).parentElement).toHaveClass(styles.actions);
    expect(question).toHaveClass(styles.question);
    expect(screen.getByRole('button', { name: '70' }).parentElement).toHaveClass(styles.marks);
  });
  // Disabling the stepper on every write would blink it at 40 % and drop its focus between steps.
  it('keeps the stepper and the switch usable while a width is being saved', async () => {
    let finish: () => void = () => undefined;
    const onChange = vi.fn().mockReturnValue(
      new Promise<void>(resolve => {
        finish = resolve;
      })
    );
    renderSection({ usefulWidthMm: 72 }, onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar Largura útil' }));

    expect(screen.getByRole('button', { name: 'Aumentar Largura útil' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Ajustar a largura útil' })).toBeEnabled();
    finish();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  it('blocks only the print buttons while a page is being queued', async () => {
    let finish: (value: 'enqueued') => void = () => undefined;
    vi.mocked(window.electron.printTest).mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    renderSection({ usefulWidthMm: 72 });

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir teste' }));

    expect(screen.getByRole('button', { name: 'Medir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Imprimir teste' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Aumentar Largura útil' })).toBeEnabled();
    finish('enqueued');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Medir' })).toBeEnabled());
  });
});
