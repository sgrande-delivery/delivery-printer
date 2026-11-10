import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { usePrinters } from 'renderer/hooks/usePrinters';
import { AxiosError, AxiosHeaders } from 'axios';
import Printers from '../Printers';
import MessagingProvider from 'renderer/providers/messaging';
import { fetchPrinters } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import styles from '../Printers.module.css';
import cardStyles from '../PrinterItem.module.css';
import type { Printer } from 'renderer/types/printer';

// The whole module, not only what this file calls: a partial factory makes the item's
// write calls throw "No export is defined on the mock" the first time a test clicks one.
vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn(),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

function printer(name: string, id = 1, station: string | null = 'kitchen'): Printer {
  return { id, name, address: '', activated: true, station, paper_width: 80, copies: 2 };
}

function httpError(status: number): AxiosError {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

// handleOpen only exists under the provider; in the app it wraps the routes (App.tsx).
function renderScreen(): ReturnType<typeof render> {
  return render(
    <MessagingProvider>
      <Printers />
    </MessagingProvider>
  );
}

describe('Printers', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset();
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([{ name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: false }]);
  });

  it('highlights a printer with no device: red card, the chip that says where it prints, and Corrigir', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    const { container } = renderScreen();

    const chip = await screen.findByText('Não encontrada — sai na padrão');
    const card = chip.closest('li');

    expect(card).toHaveClass(cardStyles.item, cardStyles.itemMissing);
    expect(within(card as HTMLElement).getByRole('button', { name: 'Corrigir' })).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Encontrada nesta máquina')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('lists the installed devices of this machine, the default one marked', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([
      { name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: true },
      { name: 'Cozinha', displayName: 'Cozinha', isDefault: false },
    ]);
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    const { container } = renderScreen();

    const title = await screen.findByText('Impressoras instaladas nesta máquina');
    const devices = screen.getAllByRole('listitem').filter(item => item.className.includes(styles.device));

    expect(title).toHaveClass(styles.devicesTitle);
    expect(devices.map(item => item.textContent)).toEqual(['printEPSON TM-T20(padrão)', 'printCozinha']);
    expect(devices[0]).toHaveClass(styles.device);
    expect(within(devices[0]).getByText('(padrão)')).toHaveClass(styles.deviceDefault);
    expectNoUndefinedClasses(container);
  });

  it('explains why the name has to be equal, once, above the cards', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    const { container } = renderScreen();

    const info = (await screen.findByText(/igual ao da impressora no Windows/)).closest('div')?.parentElement;

    expect(info).toHaveClass(styles.info);
    expect(info).toHaveTextContent(/Quando não é, o comprovante sai na impressora padrão sem aviso/);
    expect(info).toHaveTextContent(/Corrija escolhendo da lista desta máquina/);
    expect(container.firstElementChild).toHaveClass(styles.root);
  });

  it('does not accuse each registered printer when no device could be read on this computer', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha', 1), printer('Bar', 2, 'bar')]);
    const { container } = renderScreen();

    expect(await screen.findByText('Não foi possível ler as impressoras deste computador')).toBeInTheDocument();
    // Neutral: no chip either way, no red border, and nothing to "Corrigir" against a list that is not there.
    expect(screen.queryByText(/Não encontrada/)).not.toBeInTheDocument();
    expect(screen.queryByText('Encontrada nesta máquina')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(2);
    screen.getAllByRole('listitem').forEach(item => expect(item).not.toHaveClass(cardStyles.itemMissing));
    expect(screen.getByText('Cozinha')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.queryByText('Impressoras instaladas nesta máquina')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows a found printer with Editar, the green chip and the plain border', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('epson tm-t20')]);
    const { container } = renderScreen();

    const chip = await screen.findByText('Encontrada nesta máquina');

    expect(chip.closest('li')).not.toHaveClass(cardStyles.itemMissing);
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Não encontrada/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  // Two rows with the same name are legitimate (two station tickets on one device) and the
  // registered name is not unique, so the screen lists both, each with its own station.
  it('lists both printers registered under the same name, without merging them', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([
      printer('EPSON TM-T20', 1, 'kitchen'),
      printer('epson tm-t20', 2, 'bar'),
    ]);
    const { container } = renderScreen();

    expect(await screen.findAllByText('Encontrada nesta máquina')).toHaveLength(2);
    expect(screen.getByText(/^Cozinha ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Bar ·/)).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('translates every station the API accepts, and falls back to the raw value', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('a', 1, 'dessert'), printer('b', 2, 'teleport')]);
    const { container } = renderScreen();

    expect(await screen.findByText(/^Sobremesa ·/)).toBeInTheDocument();
    expect(screen.getByText(/^teleport ·/)).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the permission message on 403, not the empty state', async () => {
    vi.mocked(fetchPrinters).mockRejectedValue(httpError(403));
    const { container } = renderScreen();

    expect(await screen.findByText('Sem permissão para ver as impressoras')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma impressora cadastrada/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the empty state on a 200 with no printers, which is not the 403', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([]);
    const { container } = renderScreen();

    expect(await screen.findByText(/Nenhuma impressora cadastrada/)).toBeInTheDocument();
    expect(screen.queryByText('Sem permissão para ver as impressoras')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the network error with a retry, distinct from the other two', async () => {
    vi.mocked(fetchPrinters).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const { container } = renderScreen();

    expect(await screen.findByText('Não foi possível carregar as impressoras')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Sem permissão para ver as impressoras')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma impressora cadastrada/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the spinner while the first read is out, and none of the other four states', () => {
    vi.mocked(fetchPrinters).mockReturnValue(new Promise(() => undefined));
    renderScreen();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma impressora cadastrada/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sem permissão para ver as impressoras')).not.toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar as impressoras')).not.toBeInTheDocument();
  });

  it('opens the drawer from the card, with the title that fits the card', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Corrigir' }));

    expect(screen.getByRole('dialog', { name: 'Corrigir impressora' })).toBeInTheDocument();
  });

  // The sidebar keeps its reader for the whole session, so the list is already there when the screen opens.
  describe('with the sidebar reading the same list', () => {
    const Sidebar: React.FC = () => {
      usePrinters();

      return null;
    };

    it('does not ask a second time on the first entry, and reads once more on each return', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([printer('EPSON TM-T20')]);
      const shell = render(<Sidebar />);
      const first = renderScreen();

      await screen.findByText('Encontrada nesta máquina');
      expect(fetchPrinters).toHaveBeenCalledTimes(1);
      expect(window.electron.listPrinters).toHaveBeenCalledTimes(1);

      first.unmount();
      const second = renderScreen();

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(await screen.findByText('Encontrada nesta máquina')).toBeInTheDocument();
      await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
      second.unmount();
      shell.unmount();
    });
  });
});
