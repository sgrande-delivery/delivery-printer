import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import Printers from '../Printers';
import MessagingProvider from 'renderer/providers/messaging';
import { fetchPrinters, updatePrinter } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';

vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn(),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const registered: Printer = {
  id: 3,
  name: 'Cozinha',
  address: 'Rua A, 1',
  activated: false,
  station: 'kitchen',
  paper_width: 80,
  copies: 2,
};

function httpError(status: number, data: unknown = {}): AxiosError {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

async function openForm(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
}

// handleOpen only exists under the provider; in the app it wraps the routes (App.tsx).
function renderScreen(): ReturnType<typeof render> {
  return render(
    <MessagingProvider>
      <Printers />
    </MessagingProvider>
  );
}

describe('PrinterForm', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([registered]);
    vi.mocked(updatePrinter).mockReset().mockResolvedValue();
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([
        { name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: false },
        { name: 'Bematech', displayName: 'Bematech', isDefault: true },
      ]);
  });

  it('offers only the installed devices for the name, starting empty when the registered one matches none', async () => {
    const { container } = renderScreen();
    await openForm();

    const select = screen.getByLabelText('Impressora do Windows') as HTMLSelectElement;

    expect(select.value).toBe('');
    expect(Array.from(select.options).map(option => option.value)).toEqual(['', 'EPSON TM-T20', 'Bematech']);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expectNoUndefinedClasses(container);
  });

  it('caps copies at 3 and offers the seven stations', async () => {
    const { container } = renderScreen();
    await openForm();

    const copies = screen.getByLabelText('Cópias') as HTMLSelectElement;
    const station = screen.getByLabelText('Setor') as HTMLSelectElement;

    expect(Array.from(copies.options).map(option => option.value)).toEqual(['1', '2', '3']);
    expect(station.options).toHaveLength(8);
    expectNoUndefinedClasses(container);
  });

  // The whole record, because the API's update DTO resets every absent field to its own
  // default: a PUT without `activated` turns a deactivated printer back on.
  it('saves the whole record with the chosen device and reloads the list', async () => {
    const { container } = renderScreen();
    await openForm();

    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'EPSON TM-T20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
    expect(updatePrinter).toHaveBeenCalledWith(3, {
      name: 'EPSON TM-T20',
      address: 'Rua A, 1',
      activated: false,
      copies: 2,
      paper_width: 80,
      station: 'kitchen',
    });
    expectNoUndefinedClasses(container);
  });

  it('sends station null when the operator picks "Sem setor"', async () => {
    renderScreen();
    await openForm();

    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'Bematech' } });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
    expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ station: null });
  });

  it('sends the chosen paper width as the number the API enum takes', async () => {
    renderScreen();
    await openForm();

    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'Bematech' } });
    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: '58' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
    expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ paper_width: 58 });
  });

  it('shows the permission message on 403 and keeps the form and what was typed', async () => {
    vi.mocked(updatePrinter).mockRejectedValue(httpError(403));
    const { container } = renderScreen();
    await openForm();

    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'Bematech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Sem permissão para alterar as impressoras/)).toBeInTheDocument();
    expect((screen.getByLabelText('Impressora do Windows') as HTMLSelectElement).value).toBe('Bematech');
    expect(fetchPrinters).toHaveBeenCalledTimes(1);
    expectNoUndefinedClasses(container);
  });

  // The body is this API's real one: UpdatePrinterRequest::failedValidation throws
  // UnprocessableEntityException, and HttpException::toArray() puts the field texts in
  // `detail`. Laravel's default `{ message, errors }` never reaches us here.
  it('shows the validation text the API sent on 422', async () => {
    vi.mocked(updatePrinter).mockRejectedValue(
      httpError(422, {
        error: 'validation error',
        status_code: 422,
        detail: { copies: ['O campo copies não pode ser maior que 3.'] },
        internal_code: 'unprocessable_entity',
      })
    );
    const { container } = renderScreen();
    await openForm();

    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'Bematech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('O campo copies não pode ser maior que 3.')).toBeInTheDocument();
    expect(fetchPrinters).toHaveBeenCalledTimes(1);
    expectNoUndefinedClasses(container);
  });

  it('keeps the registered name and does not offer a free list when no device could be read', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    const { container } = renderScreen();
    await openForm();

    expect(screen.queryByLabelText('Impressora do Windows')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
    expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ name: 'Cozinha', address: 'Rua A, 1' });
    expectNoUndefinedClasses(container);
  });

  it('confirms the save and keeps the list up while it is read again', async () => {
    let finishReload = (_printers: Printer[]): void => undefined;
    renderScreen();
    await openForm();

    vi.mocked(fetchPrinters).mockImplementation(
      () =>
        new Promise<Printer[]>(resolve => {
          finishReload = resolve;
        })
    );
    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'Bematech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Impressora atualizada.')).toBeInTheDocument();
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Cozinha')).toBeInTheDocument();

    finishReload([{ ...registered, name: 'Bematech' }]);

    // The row now names a device that exists: the warning is gone and the row says so.
    expect(await screen.findByText('encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('does not announce success when the save fails', async () => {
    vi.mocked(updatePrinter).mockRejectedValue(httpError(500));
    renderScreen();
    await openForm();

    fireEvent.change(screen.getByLabelText('Impressora do Windows'), { target: { value: 'Bematech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await screen.findByText(/Não foi possível salvar/);
    expect(screen.queryByText('Impressora atualizada.')).not.toBeInTheDocument();
  });
});
