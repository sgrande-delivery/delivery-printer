import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import PrinterSettings from '../PrinterSettings';
import formStyles from '../PrinterSettingsForm.module.css';
import rowStyles from '../SettingsRow.module.css';
import screenStyles from '../PrinterSettings.module.css';
import MessagingProvider from 'renderer/providers/messaging';
import ThemeProvider from 'renderer/providers/theme';
import { api } from 'renderer/services/api';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

// Mocking the HTTP layer, not the service: the body of the PUT is what matters here.
vi.mock('renderer/services/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }));

// The baseline is the session's restaurant.printer_settings. The mock keeps STATE and notifies, like
// the real provider: a vi.fn() that writes nothing would make the baseline never move, and every
// assertion on the PUT body would compare against the session copy (a self-consistent fiction).
type Restaurant = { name?: string; printer_settings: unknown } | null;

const auth = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    restaurant: null as Restaurant,
    set(next: Restaurant): void {
      store.restaurant = next;
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    spy: vi.fn(),
    // Stable identity, like the provider's useCallback: a new one per render would re-run the revalidate.
    setPrinterSettings(settings: unknown): void {
      store.spy(settings);
      store.set(store.restaurant ? { ...store.restaurant, printer_settings: settings } : null);
    },
  };

  return store;
});

vi.mock('renderer/providers/auth', async () => {
  const { useSyncExternalStore } = await import('react');

  return {
    useAuth: () => {
      const restaurant = useSyncExternalStore(auth.subscribe, () => auth.restaurant);

      return { restaurant, setPrinterSettings: auth.setPrinterSettings };
    },
  };
});

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

// The session copy and the server's answer agree, unless a test says otherwise.
function givenSettings(settings: unknown): void {
  auth.set({ name: 'X', printer_settings: settings });
  vi.mocked(api.get).mockResolvedValue({ data: { restaurant: { printer_settings: settings } } });
}

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
    <ThemeProvider>
      <MessagingProvider>
        <PrinterSettings />
      </MessagingProvider>
    </ThemeProvider>
  );
}

function group(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

function shown(name: string): string {
  return group(name).querySelector('[aria-live]')?.textContent ?? '';
}

function increase(name: string): void {
  fireEvent.click(within(group(name)).getByRole('button', { name: `Aumentar ${name}` }));
}

function decrease(name: string): void {
  fireEvent.click(within(group(name)).getByRole('button', { name: `Diminuir ${name}` }));
}

function paper(): HTMLElement {
  return screen.getByTestId('preview-paper');
}

describe('PrinterSettings', () => {
  beforeEach(() => {
    auth.set({ name: 'Pizzaria Bella Massa', printer_settings: loaded });
    auth.spy.mockReset();
    vi.mocked(api.get)
      .mockReset()
      .mockResolvedValue({ data: { restaurant: { printer_settings: loaded } } });
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: {} });
  });

  describe('baseline', () => {
    it('reads the session copy and never asks GET /printerSettings (the wrong table)', async () => {
      renderScreen();

      await waitFor(() => expect(api.get).toHaveBeenCalled());
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/users/me');
      expect(api.get).not.toHaveBeenCalledWith('/printerSettings');
    });

    it('adopts the server copy when the screen opens, so a save does not undo the panel', async () => {
      const fresher = { ...loaded, delivery_printer_version: '2.9.0' };
      vi.mocked(api.get).mockResolvedValue({ data: { restaurant: { printer_settings: fresher } } });
      renderScreen();

      await waitFor(() => expect(auth.spy).toHaveBeenCalledWith(fresher));
    });

    it('keeps the session copy and says so when the server cannot be read', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('offline'));
      renderScreen();

      expect(await screen.findByText(/Não foi possível conferir as configurações no servidor/)).toBeInTheDocument();
      expect(group('Tamanho da fonte')).toBeInTheDocument();
      expect(auth.spy).not.toHaveBeenCalled();
    });

    it('reads the server once per visit, even though the failure message re-renders the screen', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('offline'));
      renderScreen();

      await screen.findByText(/Não foi possível conferir as configurações no servidor/);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(api.get).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['no restaurant', { data: {} }],
      ['the wrong table', { data: { restaurant: { printer_settings: { pizza_calculate: 'max' } } } }],
      ['an array', { data: { restaurant: { printer_settings: [] } } }],
    ])('does not adopt an answer with %s', async (_name, answer) => {
      vi.mocked(api.get).mockResolvedValue(answer);
      renderScreen();

      await waitFor(() => expect(api.get).toHaveBeenCalled());
      await screen.findByRole('group', { name: 'Tamanho da fonte' });
      expect(auth.spy).not.toHaveBeenCalled();
    });

    it.each([
      ['empty object', {}],
      ['only the general restaurant settings (the wrong table)', { pizza_calculate: 'max', tax_mode: 'a' }],
      ['an array', []],
      ['null', null],
    ])('does not save over a baseline that is %s, and still offers the appearance', (_name, baseline) => {
      givenSettings(baseline);
      const { container } = renderScreen();

      expect(screen.getByText('Não foi possível ler as configurações de impressão')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Tamanho da fonte' })).not.toBeInTheDocument();
      expect(screen.getByText(/vale só neste computador/i)).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Aparência' }).closest('section')?.parentElement?.className).toContain(
        screenStyles.fallback
      );
      expectNoUndefinedClasses(container);
    });

    it('does not save without a restaurant in the session', () => {
      auth.set(null);
      renderScreen();

      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    });
  });

  describe('controls', () => {
    it('shows the stored values with their unit, as steppers and not selects', () => {
      renderScreen();

      expect(shown('Comprovante de produção')).toBe('2');
      expect(shown('Comprovante de expedição')).toBe('1');
      expect(shown('Tamanho da fonte')).toBe('12 px');
      expect(shown('Margem')).toBe('10 px');
      expect(screen.getByRole('switch', { name: 'Sem margem' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('walks the closed set, not the number: from 12 the next is 14', () => {
      renderScreen();

      increase('Tamanho da fonte');
      expect(shown('Tamanho da fonte')).toBe('14 px');
      increase('Tamanho da fonte');
      expect(shown('Tamanho da fonte')).toBe('16 px');
      decrease('Tamanho da fonte');
      decrease('Tamanho da fonte');
      expect(
        within(group('Tamanho da fonte')).getByRole('button', { name: 'Diminuir Tamanho da fonte' })
      ).toBeDisabled();
    });

    it('walks the margin in px from the 0 px that is stored as 1, and stops at 40', () => {
      givenSettings({ ...loaded, margin_size: 1 });
      renderScreen();

      expect(shown('Margem')).toBe('0 px');
      increase('Margem');
      expect(shown('Margem')).toBe('10 px');

      for (let i = 0; i < 8; i++) {
        increase('Margem');
      }

      expect(shown('Margem')).toBe('40 px');
      expect(within(group('Margem')).getByRole('button', { name: 'Aumentar Margem' })).toBeDisabled();
    });

    it('stops the copies at 1 and 4', () => {
      renderScreen();

      for (let i = 0; i < 5; i++) {
        increase('Comprovante de produção');
      }

      expect(shown('Comprovante de produção')).toBe('4');
      expect(within(group('Comprovante de produção')).getByRole('button', { name: /Aumentar/ })).toBeDisabled();
    });

    it('shows a stored value outside the set as it is, clean, and walks on from it', () => {
      givenSettings({ ...loaded, font_size: 13 });
      renderScreen();

      expect(shown('Tamanho da fonte')).toBe('13 px');
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();

      increase('Tamanho da fonte');
      expect(shown('Tamanho da fonte')).toBe('14 px');
    });

    it('does not rewrite a stored value outside the set when a save does not touch it', async () => {
      givenSettings({ ...loaded, font_size: 13 });
      renderScreen();

      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/printerSettings', {
          ...loaded,
          font_size: 13,
          production_template_copies: 3,
        });
      });
    });

    it('shows a key the server did not return as "—", and invents nothing until it is moved', async () => {
      givenSettings({ font_size: 12, delivery_printer_version: '1.4.2' });
      renderScreen();

      expect(shown('Comprovante de produção')).toBe('—');
      expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch', { name: 'Sem margem' }));
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/printerSettings', {
          font_size: 12,
          delivery_printer_version: '1.4.2',
          no_margin: true,
        });
      });
    });

    it('has no control for the width, which the admin panel does not edit either', () => {
      renderScreen();

      expect(screen.queryByText('Largura máxima')).not.toBeInTheDocument();
    });
  });

  describe('Sem margem', () => {
    it('disables the margin and swaps its hint, and gives it back when turned off', () => {
      renderScreen();

      expect(group('Margem').parentElement).toHaveTextContent('Em pixels');
      fireEvent.click(screen.getByRole('switch', { name: 'Sem margem' }));

      expect(screen.getByRole('switch', { name: 'Sem margem' })).toHaveAttribute('aria-checked', 'true');
      expect(within(group('Margem')).getByRole('button', { name: 'Aumentar Margem' })).toBeDisabled();
      expect(within(group('Margem')).getByRole('button', { name: 'Diminuir Margem' })).toBeDisabled();
      expect(group('Margem').parentElement).toHaveTextContent('Desligada por "Sem margem"');

      fireEvent.click(screen.getByRole('switch', { name: 'Sem margem' }));

      expect(within(group('Margem')).getByRole('button', { name: 'Aumentar Margem' })).toBeEnabled();
      expect(group('Margem').parentElement).toHaveTextContent('Em pixels');
    });

    it('keeps the margin value in the payload when it is switched on', async () => {
      renderScreen();

      fireEvent.click(screen.getByRole('switch', { name: 'Sem margem' }));
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/printerSettings', { ...loaded, no_margin: true });
      });
    });
  });

  describe('unsaved changes bar', () => {
    it('appears only with a change, and goes away when the value comes back to the stored one', () => {
      renderScreen();

      expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();

      increase('Comprovante de produção');
      expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();

      decrease('Comprovante de produção');
      expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();
    });

    it('"Descartar" goes back to what came from the server and sends nothing', () => {
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('switch', { name: 'Sem margem' }));
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

      expect(shown('Tamanho da fonte')).toBe('12 px');
      expect(screen.getByRole('switch', { name: 'Sem margem' })).toHaveAttribute('aria-checked', 'false');
      expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    it('"Salvar" sends the whole payload (max_width, version, unknown keys) and adopts it', async () => {
      renderScreen();

      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/printerSettings', { ...loaded, production_template_copies: 3 });
      });
      expect(await screen.findByText('Configurações de impressão salvas.')).toBeInTheDocument();
      expect(auth.spy).toHaveBeenCalledWith({ ...loaded, production_template_copies: 3 });
    });

    // PUT /printerSettings deletes every row and recreates the payload's keys: the body is built over the
    // server's copy read at save time. The version below is the one the panel published meanwhile.
    it('builds the PUT over the copy read at save time, not over the session one', async () => {
      renderScreen();
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

      const fresher = { ...loaded, delivery_printer_version: '2.9.0', panel_only_key: 'set meanwhile' };
      vi.mocked(api.get).mockResolvedValue({ data: { restaurant: { printer_settings: fresher } } });
      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/printerSettings', { ...fresher, production_template_copies: 3 });
      });
      expect(auth.restaurant?.printer_settings).toEqual({ ...fresher, production_template_copies: 3 });
    });

    it('does not send when the copy cannot be read before saving', async () => {
      renderScreen();
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

      vi.mocked(api.get).mockRejectedValue(new Error('offline'));
      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(
        await screen.findByText(/Não foi possível confirmar as configurações atuais. Nada foi salvo/)
      ).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
      expect(shown('Comprovante de produção')).toBe('3');
    });

    it.each([
      ['no restaurant', { data: {} }],
      ['the wrong table', { data: { restaurant: { printer_settings: { pizza_calculate: 'max' } } } }],
      ['an array', { data: { restaurant: { printer_settings: [] } } }],
    ])('does not send when the answer before saving has %s', async (_name, answer) => {
      renderScreen();
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

      vi.mocked(api.get).mockResolvedValue(answer);
      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText(/Não foi possível confirmar as configurações atuais/)).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    // Chromium submits a form implicitly on Enter in a radio when it has a submit button.
    it('has no submit button, so Enter on an appearance radio cannot write the restaurant settings', async () => {
      const { container } = renderScreen();
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
      increase('Tamanho da fonte');

      expect(container.querySelector('button[type="submit"], input[type="submit"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('type', 'button');

      fireEvent.submit(container.querySelector('form') as HTMLFormElement);
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(api.put).not.toHaveBeenCalled();
    });

    it('clears the bar after a save', async () => {
      renderScreen();

      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await screen.findByText('Configurações de impressão salvas.');
      expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();
    });

    it('blocks both buttons while the save is in flight', async () => {
      let finish: (value: unknown) => void = () => undefined;
      vi.mocked(api.put).mockReturnValue(new Promise(resolve => (finish = resolve)));
      renderScreen();

      increase('Comprovante de produção');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled());
      expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
      finish({ data: {} });
      await screen.findByText('Configurações de impressão salvas.');
    });

    it('says nothing was saved on a 403 and keeps the changes on screen', async () => {
      vi.mocked(api.put).mockRejectedValue(httpError(403));
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText(/Sem permissão para alterar as configurações/)).toBeInTheDocument();
      expect(screen.queryByText('Configurações de impressão salvas.')).not.toBeInTheDocument();
      // Opening the screen adopts the server copy; what must not be adopted is the unsaved payload.
      expect(auth.spy).not.toHaveBeenCalledWith(expect.objectContaining({ font_size: 14 }));
      expect(shown('Tamanho da fonte')).toBe('14 px');
      expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled();
    });

    it('styles the failure text of the bar', async () => {
      vi.mocked(api.put).mockRejectedValue(httpError(403));
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect((await screen.findByRole('alert')).className).toContain(formStyles.barError);
    });

    it('clears the error on "Descartar"', async () => {
      vi.mocked(api.put).mockRejectedValue(httpError(403));
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await screen.findByText(/Sem permissão/);
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

      expect(screen.queryByText(/Sem permissão/)).not.toBeInTheDocument();
    });

    it('does not carry a failure over to the next change after "Descartar"', async () => {
      vi.mocked(api.put).mockRejectedValue(httpError(403));
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await screen.findByText(/Sem permissão/);
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
      increase('Margem');

      expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
      expect(screen.queryByText(/Sem permissão/)).not.toBeInTheDocument();
    });

    it('drops the previous failure as soon as the next attempt starts', async () => {
      vi.mocked(api.put)
        .mockRejectedValueOnce(httpError(403))
        .mockReturnValue(new Promise(() => undefined));
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await screen.findByText(/Sem permissão/);
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(screen.queryByText(/Sem permissão/)).not.toBeInTheDocument());
    });

    // Defensive contract: the endpoint validates nothing today, so a 422 is not observed behaviour.
    it('defensively shows the API validation text if a 422 ever comes back', async () => {
      vi.mocked(api.put).mockRejectedValue(
        httpError(422, { error: 'validation error', detail: { font_size: ['Fonte inválida.'] } })
      );
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText('Fonte inválida.')).toBeInTheDocument();
    });

    it('says to check the internet on any other failure', async () => {
      vi.mocked(api.put).mockRejectedValue(new Error('network'));
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText(/Verifique a internet deste computador/)).toBeInTheDocument();
    });
  });

  describe('preview', () => {
    it('is an illustration with the real restaurant name, and asks the API for no HTML', () => {
      renderScreen();

      expect(within(paper()).getByText('PIZZARIA BELLA MASSA')).toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('print'));
    });

    it('takes its width from the saved max_width', () => {
      givenSettings({ ...loaded, max_width: 58 });
      renderScreen();

      expect(paper().style.width).toBe('186px');
    });

    it('is 256 px wide for the default 80 mm', () => {
      renderScreen();

      expect(paper().style.width).toBe('256px');
    });

    it('changes the text size with the font', () => {
      renderScreen();

      expect(paper().style.fontSize).toBe('12px');
      increase('Tamanho da fonte');
      expect(paper().style.fontSize).toBe('14px');
    });

    it('changes the padding with the margin, and with Sem margem', () => {
      renderScreen();

      const before = paper().style.padding;
      increase('Margem');
      expect(paper().style.padding).not.toBe(before);

      fireEvent.click(screen.getByRole('switch', { name: 'Sem margem' }));
      expect(paper().style.padding).toBe('10px 4px 22px');
    });

    it('moves back when the change is discarded', () => {
      renderScreen();

      increase('Tamanho da fonte');
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

      expect(paper().style.fontSize).toBe('12px');
    });
  });

  describe('texts and layout', () => {
    it('carries the note of the design verbatim', () => {
      renderScreen();

      expect(
        screen.getByText(
          'Estas configurações são do restaurante e valem também no painel administrativo. Quem aplica no comprovante é o servidor.'
        )
      ).toBeInTheDocument();
    });

    it('titles the cards and keeps the hints of the design', () => {
      renderScreen();

      expect(screen.getByRole('heading', { name: 'Cópias' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Layout do comprovante' })).toBeInTheDocument();
      expect(screen.getByText('Sai na impressora do setor quando o pedido entra')).toBeInTheDocument();
      expect(screen.getByText('Sai quando o pedido é despachado')).toBeInTheDocument();
      expect(screen.getByText('Usa toda a largura da bobina')).toBeInTheDocument();
    });

    it('puts the appearance after the note, in the same column', () => {
      const { container } = renderScreen();
      const note = container.querySelector(`.${formStyles.note}`);
      const appearance = screen.getByRole('heading', { name: 'Aparência' }).closest('section');

      expect(note?.compareDocumentPosition(appearance as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(note?.parentElement).toBe(appearance?.parentElement);
    });

    it('has the classes that carry the layout', async () => {
      const { container } = renderScreen();
      await waitFor(() => expect(auth.spy).toHaveBeenCalled());
      increase('Tamanho da fonte');

      expect(container.querySelector('form')?.className).toContain(formStyles.grid);
      expect(screen.getByRole('heading', { name: 'Cópias' }).closest('section')?.className).toContain(formStyles.card);
      expect(screen.getByRole('heading', { name: 'Cópias' }).className).toContain(formStyles.cardTitle);
      expect(screen.getByText('Sai quando o pedido é despachado').className).toContain(rowStyles.hint);
      expect(screen.getByText('Sai quando o pedido é despachado').parentElement?.className).toContain(rowStyles.text);
      expect(screen.getByText('Sai quando o pedido é despachado').parentElement?.parentElement?.className).toContain(
        rowStyles.row
      );
      expect(screen.getByRole('heading', { name: 'Cópias' }).closest('section')?.parentElement?.className).toContain(
        formStyles.column
      );
      expect(screen.getByLabelText('Pré-visualização').className).toContain(formStyles.preview);
      expect(paper().className).toContain(formStyles.paper);
      expect(paper().parentElement?.className).toContain(formStyles.stage);
      expect(screen.getByRole('region', { name: 'Alterações não salvas' }).className).toContain(formStyles.bar);
      expect(screen.getByText('Usa toda a largura da bobina').parentElement?.parentElement?.className).toContain(
        rowStyles.last
      );
      expectNoUndefinedClasses(container);
    });
  });

  describe('appearance', () => {
    it('is on the screen and says it is local', async () => {
      renderScreen();

      expect(screen.getByRole('heading', { name: 'Aparência' })).toBeInTheDocument();
      expect(screen.getByText(/vale só neste computador/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Automático (segue o Windows)')).toBeInTheDocument();
      expect(screen.getByLabelText('Claro')).toBeInTheDocument();
      expect(screen.getByLabelText('Escuro')).toBeInTheDocument();
    });

    it('changes the theme on the click, and that is not an unsaved change of the restaurant', async () => {
      const electron = window.electron as unknown as { setUiTheme: ReturnType<typeof vi.fn> };
      electron.setUiTheme.mockResolvedValue('dark');
      renderScreen();

      fireEvent.click(screen.getByLabelText('Escuro'));

      await waitFor(() => expect(electron.setUiTheme).toHaveBeenCalledWith('dark'));
      expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });
  });
});
