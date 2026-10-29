import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TestPrint from '../TestPrint';
import MessagingProvider from 'renderer/providers/messaging';
import { usePrinters } from 'renderer/hooks/usePrinters';
import { fetchPrinters } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';
import { buildTestPrintPage } from '../../../../main/testPrintPage';
import packageJson from '../../../../../package.json';
import styles from '../TestPrint.module.css';
import optionStyles from '../PrinterOption.module.css';
import listStyles from '../PrinterOptionList.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import iconStyles from 'renderer/base/Icon.module.css';

vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn(),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const kitchen: Printer = {
  id: 1,
  name: 'EPSON TM-T20',
  address: 'Rua A, 1',
  activated: true,
  station: 'kitchen',
  paper_width: 80,
  copies: 1,
};
const bar: Printer = { ...kitchen, id: 2, name: 'Bar', station: 'bar', paper_width: 58 };

function renderScreen(): ReturnType<typeof render> {
  return render(
    <MessagingProvider>
      <TestPrint />
    </MessagingProvider>
  );
}

function options(): HTMLElement[] {
  return screen.getAllByRole('radio');
}

// The text of the preview, line by line, in order.
function previewLines(container: HTMLElement): string[] {
  const paper = container.querySelector(`.${styles.frame}`) as HTMLElement;

  return Array.from(paper.children).map(line => line.textContent ?? '');
}

// The text of the page the main process prints, line by line, in order.
function pageLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  return Array.from(doc.querySelectorAll('.frame > *')).map(line => line.textContent ?? '');
}

describe('TestPrint', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([kitchen, bar]);
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([
        { name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: true },
        { name: 'Bar', displayName: 'Bar', isDefault: false },
      ]);
    vi.mocked(window.electron.printTest).mockReset().mockResolvedValue('enqueued');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists one option per registration with its sector, and the first comes selected', async () => {
    const { container } = renderScreen();

    await screen.findAllByRole('radio');

    expect(options()).toHaveLength(2);
    expect(within(options()[0]).getByText('EPSON TM-T20')).toBeInTheDocument();
    expect(within(options()[0]).getByText('Cozinha')).toHaveClass(optionStyles.tag);
    expect(options()[1].querySelector(`.${optionStyles.name}`)).toHaveTextContent('Bar');
    expect(within(options()[1]).getAllByText('Bar')).toHaveLength(2);
    expect(options()[0]).toHaveAttribute('aria-checked', 'true');
    expect(options()[1]).toHaveAttribute('aria-checked', 'false');
    expect(options()[0]).toHaveClass(optionStyles.option);
    expect(options()[0]).toHaveClass(optionStyles.optionSelected);
    expect(options()[1]).not.toHaveClass(optionStyles.optionSelected);
    expect(options()[0].querySelector(`.${optionStyles.radio}`)).toHaveClass(optionStyles.radioSelected);
    expect(options()[1].querySelector(`.${optionStyles.radio}`)).not.toHaveClass(optionStyles.radioSelected);
    expect(container.firstElementChild).toHaveClass(styles.root);
    expectNoUndefinedClasses(container);
  });

  it('carries the layout classes, one element each', async () => {
    const { container } = renderScreen();
    await screen.findAllByRole('radio');

    const [column, previewColumn] = Array.from(container.firstElementChild?.children ?? []);
    expect(column).toHaveClass(styles.column);
    expect(previewColumn).toHaveClass(styles.previewColumn);
    expect(screen.getByText('Impressora', { selector: 'div' })).toHaveClass(styles.label);
    expect(screen.getByText('Página de teste')).toHaveClass(styles.label);
    expect(screen.getByRole('radiogroup')).toHaveClass(listStyles.list);
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName('Impressora');
    expect(screen.getByRole('button', { name: 'Imprimir página de teste' }).parentElement).toHaveClass(
      styles.actionRow
    );
    expect(screen.getByRole('status')).toHaveClass(styles.message);
    expect(screen.getByRole('status')).toHaveClass(styles.messageMuted);
    expect(container.querySelector(`.${styles.paper}`)?.parentElement).toHaveClass(styles.previewBackdrop);
  });

  it('says so when no printer is registered', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([]);
    renderScreen();

    expect(await screen.findByText('Nenhuma impressora cadastrada para este restaurante.')).toHaveClass(styles.empty);
  });

  it('opens with the intro of the design', async () => {
    renderScreen();
    await screen.findAllByRole('radio');

    expect(
      screen.getByText(
        'Imprime uma página gerada aqui mesmo, sem depender do servidor. Use na instalação ou para conferir se a impressora certa responde.'
      )
    ).toHaveClass(styles.intro);
  });

  it('picking another one moves the selection and clears the answer about the previous', async () => {
    renderScreen();
    await screen.findAllByRole('radio');

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));
    expect(await screen.findByText(/Enviado às .*Confira se a página saiu\./)).toBeInTheDocument();

    fireEvent.click(options()[1]);

    expect(options()[1]).toHaveAttribute('aria-checked', 'true');
    expect(options()[0]).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/Enviado às/)).not.toBeInTheDocument();
  });

  it('prints with the registration, the translated sector, the roll and the resolved device', async () => {
    renderScreen();
    await screen.findAllByRole('radio');

    fireEvent.click(options()[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));

    await waitFor(() =>
      expect(window.electron.printTest).toHaveBeenCalledWith({
        printerName: 'Bar',
        stationLabel: 'Bar',
        paperWidth: 58,
        deviceName: 'Bar',
      })
    );
    expect(window.electron.rawPrint).not.toHaveBeenCalled();
  });

  it('says it was sent, not printed, and shows the sending state meanwhile', async () => {
    let resolve: (value: 'enqueued') => void = () => undefined;
    vi.mocked(window.electron.printTest).mockReturnValue(new Promise(r => (resolve = r)));
    const { container } = renderScreen();
    await screen.findAllByRole('radio');

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));

    const busy = await screen.findByRole('button', { name: 'Imprimindo…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveClass(buttonStyles.h44);
    expect(busy).toHaveClass(buttonStyles.containedPrimary);
    expect(screen.getByText('Enviando para EPSON TM-T20…')).toHaveClass(styles.messageWorking);
    expect(screen.getByText('progress_activity')).toHaveClass('spin');

    await act(async () => resolve('enqueued'));

    const done = screen.getByText(/Enviado às \d{2}:\d{2}\. Confira se a página saiu\./);
    expect(done).toHaveClass(styles.messageOk);
    expect(screen.getByText('check_circle')).toHaveClass(iconStyles.root);
    expect(screen.queryByText(/\bimpresso\b/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir página de teste' })).toBeEnabled();
    expectNoUndefinedClasses(container);
  });

  it('two quick clicks queue one page', async () => {
    let resolve: (value: 'enqueued') => void = () => undefined;
    vi.mocked(window.electron.printTest).mockReturnValue(new Promise(r => (resolve = r)));
    renderScreen();
    await screen.findAllByRole('radio');

    const button = screen.getByRole('button', { name: 'Imprimir página de teste' });
    fireEvent.click(button);
    fireEvent.click(button);

    await act(async () => resolve('enqueued'));

    expect(window.electron.printTest).toHaveBeenCalledTimes(1);
  });

  it('can be sent again once the first answered', async () => {
    renderScreen();
    await screen.findAllByRole('radio');

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));
    await screen.findByText(/Enviado às/);
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));

    await waitFor(() => expect(window.electron.printTest).toHaveBeenCalledTimes(2));
  });

  it('lets a registration that matches no device be tested, and says where it will come out', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([
      { name: 'Outra', displayName: 'Outra', isDefault: true },
    ]);
    renderScreen();
    await screen.findAllByRole('radio');

    const warnings = screen.getAllByText('Não encontrada — sai na padrão');
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toHaveClass(optionStyles.warning);

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));

    await waitFor(() =>
      expect(window.electron.printTest).toHaveBeenCalledWith(expect.objectContaining({ deviceName: null }))
    );
    expect(previewLines(document.body)).toContain('Impressora: padrão do Windows');
  });

  it('does not accuse a printer when the computer printers could not be read', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    renderScreen();
    await screen.findAllByRole('radio');

    expect(screen.queryByText('Não encontrada — sai na padrão')).not.toBeInTheDocument();
  });

  it('shows the cause when the page cannot be queued, in the error colour and in the toast', async () => {
    vi.mocked(window.electron.printTest).mockRejectedValue(
      new Error("Error invoking remote method 'printTest': Error: disco cheio")
    );
    renderScreen();
    await screen.findAllByRole('radio');

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));

    const inline = await screen.findByRole('alert');
    expect(inline).toHaveTextContent('Não foi possível enviar: disco cheio.');
    expect(inline).toHaveClass(styles.messageErr);
    expect(await screen.findByText('Não foi possível enviar a página de teste: disco cheio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimir página de teste' })).toBeEnabled();
  });

  it('does not ask twice on first entry with the sidebar reading, and reads again on each return', async () => {
    const Sidebar: React.FC = () => {
      usePrinters();
      return null;
    };
    const shell = render(
      <MessagingProvider>
        <Sidebar />
      </MessagingProvider>
    );
    const first = renderScreen();

    await screen.findAllByRole('radio');
    expect(fetchPrinters).toHaveBeenCalledTimes(1);

    first.unmount();
    renderScreen();

    expect(await screen.findAllByRole('radio')).toHaveLength(2);
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
    shell.unmount();
  });

  it('keeps the options still while a page is being sent', async () => {
    vi.mocked(window.electron.printTest).mockReturnValue(new Promise(() => undefined));
    renderScreen();
    await screen.findAllByRole('radio');

    fireEvent.click(screen.getByRole('button', { name: 'Imprimir página de teste' }));

    await waitFor(() => expect(options()[1]).toBeDisabled());
    fireEvent.click(options()[1]);
    expect(options()[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('offers a retry when the printers cannot be loaded', async () => {
    vi.mocked(fetchPrinters).mockRejectedValueOnce(new Error('rede'));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findAllByRole('radio')).toHaveLength(2);
  });

  describe('the preview mirrors the page that comes out', () => {
    const when = new Date(2026, 9, 28, 15, 42, 7);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(when);
    });

    it.each([
      [
        '80 mm',
        0,
        { printerName: 'EPSON TM-T20', stationLabel: 'Cozinha', paperWidth: 80, deviceName: 'EPSON TM-T20' },
      ],
      ['58 mm', 1, { printerName: 'Bar', stationLabel: 'Bar', paperWidth: 58, deviceName: 'Bar' }],
    ])('same lines, same order, for the %s roll', async (_name, index, request) => {
      const { container } = renderScreen();
      await screen.findAllByRole('radio');
      await act(async () => {
        fireEvent.click(options()[index]);
      });

      expect(previewLines(container)).toEqual(pageLines(buildTestPrintPage(request, packageJson.version, when)));
    });

    it('carries the accents line, the frame and both rulers', async () => {
      const { container } = renderScreen();
      await screen.findAllByRole('radio');

      const lines = previewLines(container);

      expect(lines).toContain('Acentos: ÁÉÍÓÚ ÂÊÔ ÃÕ Ç');
      expect(lines).toContain('|<-- 80 mm -->|');
      expect(lines).toContain('1234567890123456789012345678901234567890');
      expect(container.querySelector(`.${styles.frame}`)).not.toBeNull();
      expect(container.querySelectorAll(`.${styles.ruler}`)).toHaveLength(2);
      expect(container.querySelector(`.${styles.paperTitle}`)).toHaveTextContent('TESTE DE IMPRESSÃO');
      expect(container.querySelectorAll(`.${styles.paperLine}`)).toHaveLength(8);
    });

    it('keeps the date line on the clock while the screen stays open', async () => {
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
      vi.setSystemTime(when);
      const { container } = renderScreen();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(previewLines(container)).toContain(`Data: ${when.toLocaleString('pt-BR')}`);

      const later = new Date(2026, 9, 28, 16, 10, 0);
      vi.setSystemTime(later);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      // The fake clock moved on with the 10 s, so the line is the new time, not the one it opened with.
      expect(previewLines(container)).toContain(`Data: ${new Date().toLocaleString('pt-BR')}`);
      expect(new Date().getTime() - later.getTime()).toBe(10_000);
    });

    it('draws the paper as wide as the roll of the registration', async () => {
      const { container } = renderScreen();
      await screen.findAllByRole('radio');

      const paper = container.querySelector(`.${styles.paper}`) as HTMLElement;
      expect(paper.style.width).toBe('240px');

      fireEvent.click(options()[1]);

      expect(paper.style.width).toBe('174px');
    });
  });
});
