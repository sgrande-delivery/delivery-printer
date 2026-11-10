import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { shell } from './shellMocks';
import Sidebar from '../Sidebar';
import Printers from 'renderer/components/printers/Printers';
import { fetchPrinters } from 'renderer/services/printers';

vi.mock('renderer/providers/auth', () => ({ useAuth: () => shell.auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn(),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const ROUTES = ['/', '/queue', '/history', '/printers', '/printer-settings', '/print-test'];

// The real sidebar, the real printers screen and the real hooks: only the borders (HTTP and IPC) are doubles.
function renderApp(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar isConnected />
      <Routes>
        {ROUTES.map(to => (
          <Route key={to} path={to} element={to === '/printers' ? <Printers /> : <p>tela {to}</p>} />
        ))}
      </Routes>
    </MemoryRouter>
  );
}

function go(label: string): void {
  fireEvent.click(screen.getByRole('link', { name: new RegExp(`^${label}`) }));
}

describe('what the sidebar costs per navigation', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters)
      .mockReset()
      .mockResolvedValue([
        { id: 1, name: 'Inexistente', address: '', activated: true, station: null, paper_width: 80, copies: 1 },
      ]);
    vi.mocked(window.electron.listPrinters).mockClear();
    vi.mocked(window.electron.queueState).mockClear();
    vi.mocked(window.electron.onQueueChanged).mockClear();
  });

  it('walks every other screen for free: one read of the printers and one of the queue for the whole session', async () => {
    renderApp();
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(1));

    for (const label of ['Fila', 'Histórico', 'Configurações', 'Teste de impressão', 'Painel', 'Fila']) {
      go(label);
    }

    expect(fetchPrinters).toHaveBeenCalledTimes(1);
    expect(window.electron.listPrinters).toHaveBeenCalledTimes(1);
    expect(window.electron.queueState).toHaveBeenCalledTimes(1);
    expect(window.electron.onQueueChanged).toHaveBeenCalledTimes(1);
  });

  it('reads the printers once when the printers screen opens, and the badge is the same list', async () => {
    renderApp();
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(1));
    // The only registered printer matches no device of the stub: the badge accuses one.
    expect(await screen.findByText('1')).toBeInTheDocument();

    go('Impressoras');
    await screen.findByText('Não encontrada — sai na padrão');
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));

    go('Fila');
    go('Painel');

    expect(fetchPrinters).toHaveBeenCalledTimes(2);
    expect(window.electron.listPrinters).toHaveBeenCalledTimes(2);
    expect(window.electron.queueState).toHaveBeenCalledTimes(1);
  });
});
