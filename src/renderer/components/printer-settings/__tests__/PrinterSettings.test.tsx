import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import PrinterSettings from '../PrinterSettings';
import MessagingProvider from 'renderer/providers/messaging';
import { api } from 'renderer/services/api';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

// Mocking the HTTP layer, not the service: the body of the PUT is what matters here.
vi.mock('renderer/services/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }));

// The baseline is the session's restaurant.printer_settings.
const auth = vi.hoisted(() => ({
  restaurant: { printer_settings: {} as Record<string, unknown> } as { printer_settings: unknown } | null,
  setPrinterSettings: vi.fn(),
}));

vi.mock('renderer/providers/auth', () => ({ useAuth: () => auth }));

const loaded = {
  font_size: 12,
  shipment_template_copies: 1,
  production_template_copies: 2,
  no_margin: false,
  max_width: 80,
  margin_size: 10,
  delivery_printer_version: '1.4.2',
  unknown_key: 'keep me',
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

// handleOpen only exists under the provider; in the app it wraps the routes (App.tsx).
function renderScreen(): ReturnType<typeof render> {
  return render(
    <MessagingProvider>
      <PrinterSettings />
    </MessagingProvider>
  );
}

describe('PrinterSettings', () => {
  beforeEach(() => {
    auth.restaurant = { printer_settings: loaded };
    auth.setPrinterSettings.mockReset();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: {} });
  });

  it('reads the baseline from the session and never requests GET /printerSettings', () => {
    renderScreen();

    expect(api.get).not.toHaveBeenCalled();
  });

  it('renders the stored values as selects, with the version as read-only text', () => {
    const { container } = renderScreen();

    expect(screen.getByLabelText('Cópias impressão produção')).toHaveValue('2');
    expect(screen.getByLabelText('Tamanho da fonte')).toHaveValue('12');
    expect(screen.getByLabelText('Tamanho das margens')).toHaveValue('10');
    expect(screen.getByLabelText('Remover margens')).not.toBeChecked();
    expect(screen.getByText('1.4.2')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(screen.queryByLabelText('Largura máxima')).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('offers exactly the admin panel sets', () => {
    renderScreen();
    const values = (label: string): string[] =>
      within(screen.getByLabelText(label))
        .getAllByRole('option')
        .map(option => option.getAttribute('value') ?? '');

    expect(values('Tamanho da fonte')).toEqual(['12', '14', '16', '18', '20', '22', '24']);
    expect(values('Cópias impressão produção')).toEqual(['1', '2', '3', '4']);
    expect(values('Cópias impressão entrega')).toEqual(['1', '2', '3', '4']);
    expect(values('Tamanho das margens')).toEqual(['1', '10', '15', '20', '25', '30', '35', '40']);
  });

  it('keeps Salvar off until something changes, then sends everything in the baseline (max_width included)', async () => {
    renderScreen();

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Cópias impressão produção'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/printerSettings', { ...loaded, production_template_copies: 3 });
    });
    expect(await screen.findByText('Configurações de impressão salvas.')).toBeInTheDocument();
    expect(auth.setPrinterSettings).toHaveBeenCalledWith({ ...loaded, production_template_copies: 3 });
  });

  it('sends the checkbox as a boolean', async () => {
    renderScreen();

    fireEvent.click(screen.getByLabelText('Remover margens'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/printerSettings', { ...loaded, no_margin: true });
    });
  });

  it('survives a partial baseline and does not invent the missing keys', async () => {
    auth.restaurant = { printer_settings: { font_size: 12, delivery_printer_version: '1.4.2' } };
    renderScreen();

    expect(screen.getByLabelText('Cópias impressão produção')).toHaveValue('');

    fireEvent.click(screen.getByLabelText('Remover margens'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/printerSettings', {
        font_size: 12,
        delivery_printer_version: '1.4.2',
        no_margin: true,
      });
    });
  });

  it('keeps a stored value outside the closed set selected instead of rewriting it', () => {
    auth.restaurant = { printer_settings: { ...loaded, font_size: 13 } };
    renderScreen();

    expect(screen.getByLabelText('Tamanho da fonte')).toHaveValue('13');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it.each([
    ['empty object', {}],
    ['only the general restaurant settings (the wrong table)', { pizza_calculate: 'max', tax_mode: 'a' }],
    ['an array', []],
    ['null', null],
  ])('does not save over a baseline that is %s', (_name, baseline) => {
    auth.restaurant = { printer_settings: baseline };
    const { container } = renderScreen();

    expect(screen.getByText('Não foi possível ler as configurações de impressão')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tamanho da fonte')).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    expectNoUndefinedClasses(container);
  });

  it('does not save without a restaurant in the session', () => {
    auth.restaurant = null;
    renderScreen();

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  // Defensive contract: the endpoint validates nothing today, so a 422 is not observed behaviour.
  it('defensively shows the API validation text on screen if a 422 ever comes back', async () => {
    vi.mocked(api.put).mockRejectedValue(
      httpError(422, { error: 'validation error', detail: { font_size: ['Fonte inválida.'] } })
    );
    renderScreen();

    fireEvent.change(screen.getByLabelText('Tamanho da fonte'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Fonte inválida.')).toBeInTheDocument();
  });

  it('says nothing was saved on a 403 save', async () => {
    vi.mocked(api.put).mockRejectedValue(httpError(403));
    renderScreen();

    fireEvent.change(screen.getByLabelText('Tamanho da fonte'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Sem permissão para alterar as configurações/)).toBeInTheDocument();
    expect(screen.queryByText('Configurações de impressão salvas.')).not.toBeInTheDocument();
    expect(auth.setPrinterSettings).not.toHaveBeenCalled();
  });
});
