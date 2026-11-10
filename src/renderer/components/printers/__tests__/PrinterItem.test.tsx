import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Printers from '../Printers';
import MessagingProvider from 'renderer/providers/messaging';
import { fetchPrinters } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';
import styles from '../PrinterItem.module.css';
import chipStyles from 'renderer/base/Chip.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import iconButtonStyles from 'renderer/base/IconButton.module.css';

vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn(),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const registered: Printer = {
  id: 3,
  name: 'EPSON TM-T20',
  address: 'Rua A, 1',
  activated: true,
  station: 'kitchen',
  paper_width: 80,
  copies: 2,
};

// handleOpen only exists under the provider; in the app it wraps the routes (App.tsx).
function renderScreen(): ReturnType<typeof render> {
  return render(
    <MessagingProvider>
      <Printers />
    </MessagingProvider>
  );
}

describe('PrinterItem', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([registered]);
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([{ name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: true }]);
  });

  it('draws the card of the design: icon square, name, chip, the detail line and one action', async () => {
    const { container } = renderScreen();

    const card = (await screen.findByText('Encontrada nesta máquina')).closest('li') as HTMLElement;
    const name = within(card).getByText('EPSON TM-T20');

    expect(card).toHaveClass(styles.item);
    expect(card.firstElementChild).toHaveClass(styles.icon);
    expect(name).toHaveClass(styles.name);
    expect(name.parentElement).toHaveClass(styles.titleRow);
    expect(within(card).getByText('Cozinha · 2 cópias · bobina 80 mm · ativa')).toHaveClass(styles.detail);
    expect(within(card).getByText('Encontrada nesta máquina')).toHaveClass(
      chipStyles.compact,
      chipStyles.ok,
      chipStyles.iconFirst
    );
    expect(container.querySelector(`.${styles.body}`)).not.toBeNull();
    expectNoUndefinedClasses(container);
  });

  it('Editar is the quiet outlined 34 px button, Corrigir the accent one', async () => {
    const { container } = renderScreen();

    const edit = await screen.findByRole('button', { name: 'Editar' });

    expect(edit).toHaveClass(buttonStyles.outlined);
    expect(edit).toHaveStyle({ height: '34px' });
    expect(edit).not.toHaveClass(buttonStyles.containedPrimary);
    expectNoUndefinedClasses(container);
  });

  it('Corrigir takes the accent fill when the name matches nothing', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([
      { name: 'Outra', displayName: 'Outra', isDefault: true },
    ]);
    renderScreen();

    const fix = await screen.findByRole('button', { name: 'Corrigir' });

    expect(fix).toHaveClass(buttonStyles.containedPrimary);
    expect(fix).toHaveStyle({ height: '34px' });
    expect(fix).not.toHaveClass(buttonStyles.outlined);
  });

  it('does not announce the accusation as an alert: the card states it, the dashboard raises it', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([
      { name: 'Outra', displayName: 'Outra', isDefault: true },
    ]);
    renderScreen();

    await screen.findByText('Não encontrada — sai na padrão');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no switch and no Desativar on the card: activation lives in the drawer', async () => {
    renderScreen();
    await screen.findByText('Encontrada nesta máquina');

    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  describe('test print', () => {
    beforeEach(() => {
      vi.mocked(window.electron.printTest).mockReset().mockResolvedValue('enqueued');
    });

    it('queues a test page for the printer of that row, resolved device included', async () => {
      const { container } = renderScreen();

      fireEvent.click(await screen.findByRole('button', { name: 'Imprimir teste' }));

      await waitFor(() =>
        expect(window.electron.printTest).toHaveBeenCalledWith({
          printerName: 'EPSON TM-T20',
          stationLabel: 'Cozinha',
          paperWidth: 80,
          deviceName: 'EPSON TM-T20',
        })
      );
      expect(await screen.findByText(/Página de teste enviada/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Imprimir teste' })).toHaveClass(iconButtonStyles.small);
      expect(window.electron.rawPrint).not.toHaveBeenCalled();
      expectNoUndefinedClasses(container);
    });

    it('is disabled for a printer that matches no device', async () => {
      vi.mocked(window.electron.listPrinters).mockResolvedValue([
        { name: 'Outra', displayName: 'Outra', isDefault: true },
      ]);
      renderScreen();

      const button = await screen.findByRole('button', { name: 'Imprimir teste' });

      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Esta impressora não foi encontrada nesta máquina');
    });

    it('shows the reason when it cannot be queued', async () => {
      vi.mocked(window.electron.printTest).mockRejectedValue(
        new Error("Error invoking remote method 'printTest': Error: disco cheio")
      );
      renderScreen();

      fireEvent.click(await screen.findByRole('button', { name: 'Imprimir teste' }));

      expect(await screen.findByText(/Não foi possível enviar a página de teste: disco cheio/)).toBeInTheDocument();
    });
  });
});
