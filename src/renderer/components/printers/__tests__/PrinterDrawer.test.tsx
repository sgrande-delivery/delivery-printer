import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import Printers from '../Printers';
import MessagingProvider from 'renderer/providers/messaging';
import { fetchPrinters, togglePrinterActive, updatePrinter } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';
import styles from '../PrinterDrawer.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import chipStyles from 'renderer/base/Chip.module.css';

vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn(),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const registered: Printer = {
  id: 3,
  name: 'Cozinha',
  address: 'Rua A, 1',
  activated: true,
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

// Corrigir, because the registered name matches no device: that is the drawer this screen exists for.
async function openDrawer(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: 'Corrigir' }));

  return screen.getByRole('dialog');
}

function pickDevice(name: string): void {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(name) }));
}

function save(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar no servidor' }));
}

// handleOpen only exists under the provider; in the app it wraps the routes (App.tsx).
function renderScreen(): ReturnType<typeof render> {
  return render(
    <MessagingProvider>
      <Printers />
    </MessagingProvider>
  );
}

describe('PrinterDrawer', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([registered]);
    vi.mocked(updatePrinter).mockReset().mockResolvedValue();
    vi.mocked(togglePrinterActive).mockReset().mockResolvedValue();
    vi.mocked(window.electron.listPrinters)
      .mockReset()
      .mockResolvedValue([
        { name: 'EPSON TM-T20', displayName: 'EPSON TM-T20', isDefault: false },
        { name: 'Bematech', displayName: 'Bematech', isDefault: true },
      ]);
  });

  describe('the shape of the design', () => {
    it('is a modal dialog with a veil, a 56 px header with the title and the close, a body and a footer', async () => {
      const { container } = renderScreen();
      const dialog = await openDrawer();

      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveClass(styles.panel);
      expect(dialog.parentElement).toHaveClass(styles.root);
      expect(dialog.parentElement?.firstElementChild).toHaveClass(styles.veil);
      expect(within(dialog).getByRole('heading', { name: 'Corrigir impressora' })).toHaveClass(styles.title);
      expect(within(dialog).getByRole('heading').parentElement).toHaveClass(styles.header);
      expect(within(dialog).getByRole('button', { name: 'Fechar' })).toHaveClass(styles.close);
      expect(container.querySelector(`.${styles.body}`)).not.toBeNull();
      expect(container.querySelector(`.${styles.footer}`)).not.toBeNull();
      expectNoUndefinedClasses(container);
    });

    it('titles the drawer Editar when the printer was found', async () => {
      vi.mocked(window.electron.listPrinters).mockResolvedValue([
        { name: 'Cozinha', displayName: 'Cozinha', isDefault: true },
      ]);
      renderScreen();

      fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

      expect(screen.getByRole('heading', { name: 'Editar impressora' })).toBeInTheDocument();
    });

    it('puts Cancelar and the accent "Salvar no servidor" in the footer, 38 px', async () => {
      renderScreen();
      await openDrawer();

      const cancel = screen.getByRole('button', { name: 'Cancelar' });
      const save = screen.getByRole('button', { name: 'Salvar no servidor' });
      expect(cancel).toHaveClass(buttonStyles.text);
      expect(cancel).toHaveStyle({ height: '38px' });
      expect(save).toHaveClass(buttonStyles.containedPrimary);
      expect(save).toHaveStyle({ height: '38px' });
    });
  });

  describe('the Windows printer', () => {
    it('lists the devices of this machine as radios, none checked while the registered name matches none', async () => {
      renderScreen();
      const dialog = await openDrawer();

      const radios = within(dialog).getAllByRole('radio', { name: /EPSON TM-T20|Bematech/ });

      expect(radios.map(radio => radio.textContent)).toEqual([
        'radio_button_uncheckedEPSON TM-T20',
        'radio_button_uncheckedBematechpadrão',
      ]);
      radios.forEach(radio => expect(radio).toHaveAttribute('aria-checked', 'false'));
      expect(within(dialog).getByRole('radiogroup', { name: 'Impressora do Windows' })).toBeInTheDocument();
    });

    it('choosing a device from the list fills the name, and checks it', async () => {
      renderScreen();
      await openDrawer();

      pickDevice('Bematech');

      expect(screen.getByRole('radio', { name: /Bematech/ })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: /Bematech/ })).toHaveClass(styles.deviceSelected);
      expect(screen.getByLabelText('Ou digite o nome')).toHaveValue('Bematech');
      expect(screen.getByRole('radio', { name: /EPSON/ })).toHaveAttribute('aria-checked', 'false');
    });

    it('accepts a name typed by hand that is not on the list, and sends it as typed', async () => {
      renderScreen();
      await openDrawer();

      fireEvent.change(screen.getByLabelText('Ou digite o nome'), { target: { value: 'Impressora do caixa 2' } });
      screen.getAllByRole('radio', { name: /EPSON|Bematech/ }).forEach(radio => {
        expect(radio).toHaveAttribute('aria-checked', 'false');
      });
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ name: 'Impressora do caixa 2' });
    });

    it('checks the device whose name differs only in letter case, like the print does', async () => {
      renderScreen();
      await openDrawer();

      fireEvent.change(screen.getByLabelText('Ou digite o nome'), { target: { value: 'bematech' } });

      expect(screen.getByRole('radio', { name: /Bematech/ })).toHaveAttribute('aria-checked', 'true');
    });

    it('cannot save an empty name', async () => {
      renderScreen();
      await openDrawer();

      fireEvent.change(screen.getByLabelText('Ou digite o nome'), { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: 'Salvar no servidor' })).toBeDisabled();
    });

    it('with no device read, says so and keeps only the typed name, saved as registered', async () => {
      vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
      renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

      expect(within(screen.getByRole('radiogroup', { name: 'Impressora do Windows' })).queryAllByRole('radio')).toEqual(
        []
      );
      expect(
        screen.getByText(/Não foi possível ler as impressoras deste computador\. Digite o nome/)
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Nome da impressora')).toHaveValue('Cozinha');
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ name: 'Cozinha', address: 'Rua A, 1' });
    });
  });

  describe('the sector', () => {
    it('offers "Sem setor" and the seven sectors of the API, the registered one pressed', async () => {
      renderScreen();
      const dialog = await openDrawer();

      const group = within(dialog).getByRole('group', { name: 'Setor' });
      const chips = within(group).getAllByRole('button');

      // "Sem setor" first, explicit: the Select this drawer replaced had it as an option, and
      // clearing by pressing the selected chip again is a gesture nobody discovers.
      expect(chips.map(chip => chip.textContent)).toEqual([
        'Sem setor',
        'Cozinha',
        'Bar',
        'Pizza',
        'Balcão',
        'Caixa',
        'Sobremesa',
        'Sushi',
      ]);
      expect(chips[0]).toHaveAttribute('aria-pressed', 'false');
      expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
      expect(chips[1]).toHaveClass(chipStyles.inverse, chipStyles.medium);
      expect(chips[2]).toHaveAttribute('aria-pressed', 'false');
      expect(chips[2]).toHaveClass(chipStyles.muted);
    });

    it('moves to another sector, and clears it when the pressed one is pressed again', async () => {
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.click(screen.getByRole('button', { name: 'Bar' }));
      expect(screen.getByRole('button', { name: 'Bar' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Cozinha' })).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(screen.getByRole('button', { name: 'Bar' }));
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ station: null });
    });

    it('keeps a sector the API holds and this app does not know, selected, and saves it untouched', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([{ ...registered, station: 'teleport' }]);
      renderScreen();
      await openDrawer();

      expect(screen.getByRole('button', { name: 'teleport' })).toHaveAttribute('aria-pressed', 'true');
      pickDevice('Bematech');
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ station: 'teleport' });
    });
  });

  describe('the copies', () => {
    it('does not go below one: zero copies is no receipt', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([{ ...registered, copies: 1 }]);
      renderScreen();
      await openDrawer();

      const less = screen.getByRole('button', { name: 'Diminuir Cópias' });

      expect(less).toBeDisabled();
      fireEvent.click(less);
      expect(screen.getByRole('group', { name: 'Cópias' })).toHaveTextContent('1');
    });

    it('does not go above three, the limit the API answers 422 to', async () => {
      renderScreen();
      await openDrawer();

      fireEvent.click(screen.getByRole('button', { name: 'Aumentar Cópias' }));

      expect(screen.getByRole('group', { name: 'Cópias' })).toHaveTextContent('3');
      expect(screen.getByRole('button', { name: 'Aumentar Cópias' })).toBeDisabled();
    });
  });

  describe('the roll', () => {
    // 58 and 80 and nothing else, and that is measured, not assumed: the delivery-api validates
    // paper_width with Rule::in(PrinterPaperWidthEnum) (UpdatePrinterRequest.php:29) and the table
    // has CHECK (paper_width IN (58, 80)). A third width can neither exist nor be saved.
    it('is a 58 / 80 choice with the registered one checked', async () => {
      renderScreen();
      await openDrawer();

      const group = screen.getByRole('radiogroup', { name: 'Bobina' });

      expect(
        within(group)
          .getAllByRole('radio')
          .map(radio => radio.textContent)
      ).toEqual(['58 mm', '80 mm']);
      expect(within(group).getByRole('radio', { name: '80 mm' })).toHaveAttribute('aria-checked', 'true');
      expect(within(group).getByRole('radio', { name: '80 mm' })).toHaveClass(styles.segmentOn);
      expect(within(group).getByRole('radio', { name: '58 mm' })).not.toHaveClass(styles.segmentOn);
    });

    it('sends the 58 the operator picks', async () => {
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.click(screen.getByRole('radio', { name: '58 mm' }));
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ paper_width: 58 });
    });
  });

  describe('saving', () => {
    // The whole record, because the API's update DTO resets every absent field to its own
    // default: a PUT without `activated` turns a deactivated printer back on.
    it('writes the whole record, closes, confirms, and reads the list again without blanking it', async () => {
      let finishReload = (_printers: Printer[]): void => undefined;
      renderScreen();
      await openDrawer();
      vi.mocked(fetchPrinters).mockImplementation(
        () =>
          new Promise<Printer[]>(resolve => {
            finishReload = resolve;
          })
      );

      pickDevice('Bematech');
      save();

      expect(
        await screen.findByText('Impressora salva. O próximo comprovante já usa este cadastro.')
      ).toBeInTheDocument();
      expect(updatePrinter).toHaveBeenCalledWith(3, {
        name: 'Bematech',
        address: 'Rua A, 1',
        activated: true,
        copies: 2,
        paper_width: 80,
        station: 'kitchen',
      });
      expect(togglePrinterActive).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText('Cozinha', { selector: 'span' })).toBeInTheDocument();

      finishReload([{ ...registered, name: 'Bematech' }]);

      // The card now names a device that exists: the accusation is gone, without reloading the screen.
      expect(await screen.findByText('Encontrada nesta máquina')).toBeInTheDocument();
      expect(screen.queryByText(/Não encontrada/)).not.toBeInTheDocument();
    });

    it('keeps a deactivated printer deactivated: the PUT carries the activation as it was', async () => {
      vi.mocked(fetchPrinters).mockResolvedValue([{ ...registered, activated: false }]);
      renderScreen();
      await openDrawer();

      pickDevice('Bematech');
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(vi.mocked(updatePrinter).mock.calls[0][1]).toMatchObject({ activated: false });
      expect(togglePrinterActive).not.toHaveBeenCalled();
    });

    it('does not fire the save twice while the first call is in flight', async () => {
      let release = (): void => undefined;
      vi.mocked(updatePrinter).mockImplementation(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          })
      );
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      save();
      save();

      expect(updatePrinter).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Salvar no servidor' })).toBeDisabled();
      await act(async () => release());
    });

    it('shows the permission message on 403, keeps the drawer open and what was typed, and does not reload', async () => {
      vi.mocked(updatePrinter).mockRejectedValue(httpError(403));
      const { container } = renderScreen();
      await openDrawer();

      pickDevice('Bematech');
      save();

      expect(await screen.findByText(/Sem permissão para alterar as impressoras/)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText('Ou digite o nome')).toHaveValue('Bematech');
      expect(fetchPrinters).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Impressora salva/)).not.toBeInTheDocument();
      expectNoUndefinedClasses(container);
    });

    // The body is this API's real one: UpdatePrinterRequest::failedValidation throws
    // UnprocessableEntityException, and HttpException::toArray() puts the field texts in
    // `detail`. Laravel's default `{ message, errors }` never reaches us here.
    it('shows the validation text the API sent on 422, and stays open', async () => {
      vi.mocked(updatePrinter).mockRejectedValue(
        httpError(422, {
          error: 'validation error',
          status_code: 422,
          detail: { copies: ['O campo copies não pode ser maior que 3.'] },
          internal_code: 'unprocessable_entity',
        })
      );
      renderScreen();
      await openDrawer();

      pickDevice('Bematech');
      save();

      expect(await screen.findByText('O campo copies não pode ser maior que 3.')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(fetchPrinters).toHaveBeenCalledTimes(1);
    });

    it('separates a failed write from a permission problem', async () => {
      vi.mocked(updatePrinter).mockRejectedValue(httpError(500));
      renderScreen();
      await openDrawer();

      pickDevice('Bematech');
      save();

      expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument();
      expect(screen.queryByText(/Sem permissão/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Impressora salva/)).not.toBeInTheDocument();
    });

    it('a new edit clears the error of the last attempt', async () => {
      vi.mocked(updatePrinter).mockRejectedValue(httpError(500));
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');
      save();
      await screen.findByText(/Não foi possível salvar/);

      fireEvent.click(screen.getByRole('button', { name: 'Bar' }));

      expect(screen.queryByText(/Não foi possível salvar/)).not.toBeInTheDocument();
    });
  });

  describe('the activation', () => {
    it('is a switch with the explanation of the design, on for an active printer', async () => {
      renderScreen();
      const dialog = await openDrawer();

      expect(within(dialog).getByRole('switch', { name: 'Ativa' })).toHaveAttribute('aria-checked', 'true');
      expect(within(dialog).getByText('Desativada, não recebe comprovantes')).toBeInTheDocument();
    });

    it('turns the printer off by the dedicated route, after the PUT, and only when the switch moved', async () => {
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.click(screen.getByRole('switch', { name: 'Ativa' }));
      save();

      await waitFor(() => expect(togglePrinterActive).toHaveBeenCalledWith(3));
      expect(updatePrinter).toHaveBeenCalledTimes(1);
      expect(vi.mocked(updatePrinter).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(togglePrinterActive).mock.invocationCallOrder[0]
      );
      expect(await screen.findByText(/Impressora salva/)).toBeInTheDocument();
    });

    it('moving the switch twice is moving it zero times: no toggle call', async () => {
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.click(screen.getByRole('switch', { name: 'Ativa' }));
      fireEvent.click(screen.getByRole('switch', { name: 'Ativa' }));
      save();

      await waitFor(() => expect(updatePrinter).toHaveBeenCalled());
      expect(togglePrinterActive).not.toHaveBeenCalled();
    });

    it('says the data went in when only the activation failed, reads the list again and stays open', async () => {
      vi.mocked(togglePrinterActive).mockRejectedValue(httpError(500));
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.click(screen.getByRole('switch', { name: 'Ativa' }));
      save();

      expect(
        await screen.findByText(/Os dados foram salvos, mas não foi possível ativar ou desativar/)
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByText(/Impressora salva/)).not.toBeInTheDocument();
      await waitFor(() => expect(fetchPrinters).toHaveBeenCalledTimes(2));
    });

    it('names the permission when the activation is the part that was refused', async () => {
      vi.mocked(togglePrinterActive).mockRejectedValue(httpError(403));
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.click(screen.getByRole('switch', { name: 'Ativa' }));
      save();

      expect(
        await screen.findByText(/Os dados foram salvos, mas sem permissão para ativar ou desativar/)
      ).toBeInTheDocument();
    });
  });

  describe('closing', () => {
    it('closes at once with Esc, the veil and the close button when nothing was touched', async () => {
      const { container } = renderScreen();
      await openDrawer();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await openDrawer();
      fireEvent.click(container.querySelector(`.${styles.veil}`) as Element);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await openDrawer();
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await openDrawer();
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(updatePrinter).not.toHaveBeenCalled();
    });

    it('asks before throwing a draft away, on each of the ways out', async () => {
      const { container } = renderScreen();
      await openDrawer();
      pickDevice('Bematech');

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Descartar as alterações?')).toBeInTheDocument();
      // Esc on the question is "no": back to the form, draft intact.
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('Descartar as alterações?')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Ou digite o nome')).toHaveValue('Bematech');

      fireEvent.click(container.querySelector(`.${styles.veil}`) as Element);
      expect(screen.getByText('Descartar as alterações?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
      expect(screen.queryByText('Descartar as alterações?')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
      expect(screen.getByText('Descartar as alterações?')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(updatePrinter).not.toHaveBeenCalled();
    });

    it('a draft put back as it was is not a draft', async () => {
      renderScreen();
      await openDrawer();

      fireEvent.click(screen.getByRole('button', { name: 'Aumentar Cópias' }));
      fireEvent.click(screen.getByRole('button', { name: 'Diminuir Cópias' }));
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not close while the save is in flight', async () => {
      let release = (): void => undefined;
      vi.mocked(updatePrinter).mockImplementation(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          })
      );
      renderScreen();
      await openDrawer();
      pickDevice('Bematech');
      save();

      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.queryByText('Descartar as alterações?')).not.toBeInTheDocument();
      await act(async () => release());
    });

    it('stops listening to Esc once it is gone', async () => {
      renderScreen();
      await openDrawer();
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('focus', () => {
    it('goes to the panel on open, and back to the button that opened it on close', async () => {
      renderScreen();
      const opener = await screen.findByRole('button', { name: 'Corrigir' });
      opener.focus();
      fireEvent.click(opener);

      expect(screen.getByRole('dialog')).toHaveFocus();

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });

    it('keeps Tab inside the panel, from the last control to the first and the other way round', async () => {
      renderScreen();
      const dialog = await openDrawer();
      const close = within(dialog).getByRole('button', { name: 'Fechar' });
      const saveButton = within(dialog).getByRole('button', { name: 'Salvar no servidor' });

      saveButton.focus();
      fireEvent.keyDown(saveButton, { key: 'Tab' });
      expect(close).toHaveFocus();

      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(saveButton).toHaveFocus();
    });

    it('lets Tab move on normally from a control in the middle', async () => {
      renderScreen();
      const dialog = await openDrawer();
      const middle = within(dialog).getByRole('button', { name: 'Bar' });
      middle.focus();

      const proceeded = fireEvent.keyDown(middle, { key: 'Tab' });

      expect(proceeded).toBe(true);
    });
  });
});
