import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import Printers from '../Printers';
import MessagingProvider from 'renderer/providers/messaging';
import { fetchPrinters, togglePrinterActive } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';

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

describe('PrinterItem', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([registered]);
    vi.mocked(togglePrinterActive).mockReset().mockResolvedValue();
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([{ name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: true }]);
  });

  it('deactivates by the dedicated route and reads the list again', async () => {
    const { container } = renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));

    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
    expect(togglePrinterActive).toHaveBeenCalledWith(3);
    expectNoUndefinedClasses(container);
  });

  it('says it is a permission problem when the toggle answers 403, and does not reload', async () => {
    vi.mocked(togglePrinterActive).mockRejectedValue(httpError(403));
    const { container } = renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText(/Sem permissão para alterar as impressoras/)).toBeInTheDocument();
    expect(fetchPrinters).toHaveBeenCalledTimes(1);
    // The printer is still shown as it is in the API: the screen did not pretend it changed.
    expect(screen.getByText('ativa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeEnabled();
    expectNoUndefinedClasses(container);
  });

  it('separates a failed toggle from a permission problem', async () => {
    vi.mocked(togglePrinterActive).mockRejectedValue(httpError(500));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText(/Não foi possível alterar a impressora/)).toBeInTheDocument();
  });

  // The route flips the column (`NOT activated`), so it is not idempotent: two calls would
  // land back on the original state and look like the click did nothing.
  it('does not fire the toggle twice while the first call is in flight', async () => {
    let release = (): void => undefined;
    vi.mocked(togglePrinterActive).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    );
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Desativar' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(togglePrinterActive).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
  });

  // The flash of the whole screen used to be the only sign of success: with it gone, the
  // list must stay up while the row is read again, and the confirmation has to be its own.
  it('confirms the toggle and updates the row without going back to loading', async () => {
    let finishReload = (_printers: Printer[]): void => undefined;
    renderScreen();
    await screen.findByText('ativa');

    vi.mocked(fetchPrinters).mockImplementation(
      () =>
        new Promise<Printer[]>(resolve => {
          finishReload = resolve;
        })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('Impressora desativada.')).toBeInTheDocument();
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('EPSON TM-T20')).toBeInTheDocument();

    finishReload([{ ...registered, activated: false }]);

    expect(await screen.findByText('inativa')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('does not announce success when the toggle fails', async () => {
    vi.mocked(togglePrinterActive).mockRejectedValue(httpError(500));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    await screen.findByText(/Não foi possível alterar a impressora/);

    expect(screen.queryByText('Impressora desativada.')).not.toBeInTheDocument();
  });
});
