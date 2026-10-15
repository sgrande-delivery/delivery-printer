import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import Printers from '../Printers';
import { fetchPrinters } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';

vi.mock('renderer/services/printers', () => ({ fetchPrinters: vi.fn() }));

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

describe('Printers', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset();
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([{ name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: false }]);
  });

  it('highlights a printer with no device and says where the print is going', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha')]);
    const { container } = render(<Printers />);

    expect(await screen.findByText('não encontrada nesta máquina')).toBeInTheDocument();
    expect(screen.getByText('a impressão está saindo na impressora padrão do Windows')).toBeInTheDocument();
    expect(screen.getByText('EPSON TM-T20')).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('does not accuse each registered printer when no device could be read on this computer', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha', 1), printer('Bar', 2, 'bar')]);
    const { container } = render(<Printers />);

    expect(await screen.findByText('Não foi possível ler as impressoras deste computador')).toBeInTheDocument();
    expect(screen.queryByText('não encontrada nesta máquina')).not.toBeInTheDocument();
    expect(screen.queryByText(/impressora padrão do Windows/)).not.toBeInTheDocument();
    expect(screen.getByText('Cozinha')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows a found printer without the warning', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('epson tm-t20')]);
    const { container } = render(<Printers />);

    expect(await screen.findByText('encontrada')).toBeInTheDocument();
    expect(screen.queryByText(/impressora padrão do Windows/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  // Two rows with the same name are legitimate (two station tickets on one device) and the
  // registered name is not unique, so the screen lists both, each with its own station.
  it('lists both printers registered under the same name, without merging them', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([
      printer('EPSON TM-T20', 1, 'kitchen'),
      printer('epson tm-t20', 2, 'bar'),
    ]);
    const { container } = render(<Printers />);

    expect(await screen.findAllByText('encontrada')).toHaveLength(2);
    expect(screen.getByText(/^Cozinha ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Bar ·/)).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('translates every station the API accepts, and falls back to the raw value', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('a', 1, 'dessert'), printer('b', 2, 'teleport')]);
    const { container } = render(<Printers />);

    expect(await screen.findByText(/^Sobremesa ·/)).toBeInTheDocument();
    expect(screen.getByText(/^teleport ·/)).toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the permission message on 403, not the empty state', async () => {
    vi.mocked(fetchPrinters).mockRejectedValue(httpError(403));
    const { container } = render(<Printers />);

    expect(await screen.findByText('Sem permissão para ver as impressoras')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma impressora cadastrada/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('shows the empty state on a 200 with no printers, which is not the 403', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([]);
    const { container } = render(<Printers />);

    expect(await screen.findByText(/Nenhuma impressora cadastrada/)).toBeInTheDocument();
    expect(screen.queryByText('Sem permissão para ver as impressoras')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  // There is no navigation chrome in this app: the way back is part of the screen.
  it('navigates back to the status screen', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([]);
    const { container } = render(<Printers />);

    fireEvent.click(await screen.findByRole('button', { name: 'voltar' }));

    expect(window.location.hash).toBe('#/');
    expectNoUndefinedClasses(container);
  });

  it('shows the network error with a retry, distinct from the other two', async () => {
    vi.mocked(fetchPrinters).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const { container } = render(<Printers />);

    expect(await screen.findByText('Não foi possível carregar as impressoras')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Sem permissão para ver as impressoras')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma impressora cadastrada/)).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });
});
