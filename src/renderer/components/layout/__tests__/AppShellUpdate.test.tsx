import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { UpdateState } from 'shared/appUpdate';
import { shell } from './shellMocks';
import AppShell from '../AppShell';
import appShellStyles from '../AppShell.module.css';

vi.mock('renderer/providers/auth', () => ({ useAuth: () => shell.auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/providers/theme', () => ({ useTheme: () => ({ resolved: shell.theme }) }));
vi.mock('renderer/hooks/useAdminSocketEvents', () => ({ useAdminSocketEvents: vi.fn() }));
vi.mock('renderer/hooks/useAdminSocket', () => ({ useAdminSocket: () => ({ isConnected: shell.connected }) }));
vi.mock('renderer/hooks/usePrintingOrder', () => ({ usePrintingOrder: vi.fn() }));
vi.mock('renderer/hooks/usePrintingBoard', () => ({ usePrintingBoard: vi.fn() }));
vi.mock('renderer/hooks/usePrintQueue', () => ({ usePrintQueue: () => shell.queue }));
vi.mock('renderer/hooks/usePrinters', () => ({ usePrinters: () => shell.printers }));
vi.mock('renderer/services/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function state(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: 'ready',
    currentVersion: '3.0.2',
    targetVersion: '3.1.0',
    percent: 100,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    lastCheckedAt: null,
    error: null,
    autoDownload: true,
    restartScheduled: false,
    pendingJobs: 0,
    releaseNotes: [],
    ...overrides,
  };
}

function renderShell(path: string, initial: UpdateState) {
  vi.mocked(window.electron.updateState).mockResolvedValue(initial);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <AppShell>
              <Outlet />
            </AppShell>
          }
        >
          <Route path="/" element={<p>conteúdo Painel</p>} />
          <Route path="/queue" element={<p>conteúdo Fila</p>} />
          <Route path="/updates" element={<p>conteúdo Atualizações</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  const emit = (next: UpdateState): void => {
    const listener = vi.mocked(window.electron.onUpdateChanged).mock.calls[0][0];
    act(() => listener(next));
  };

  return { ...view, emit };
}

const banner = () => screen.queryByRole('status', { name: 'Aviso de atualização pronta' });

describe('AppShell and the update', () => {
  beforeEach(() => {
    shell.connected = true;
    shell.queue.pending = [];
    shell.queue.failed = [];
    shell.printers.printers = [];
    shell.handleOpen.mockClear();
    vi.mocked(window.electron.onUpdateChanged)
      .mockReset()
      .mockReturnValue(() => undefined);
    vi.mocked(window.electron.restartToUpdate)
      .mockReset()
      .mockResolvedValue(state({ status: 'restarting' }));
  });

  describe('the banner', () => {
    it.each(['/', '/queue'])(
      'shows on %s when the update is ready, before the screen, inside the content',
      async path => {
        renderShell(path, state());

        const found = await screen.findByRole('status', { name: 'Aviso de atualização pronta' });
        const content = document.getElementById('app-content') as HTMLElement;
        expect(content).toHaveClass(appShellStyles.content);
        expect(content.firstElementChild).toBe(found);
        expect(found).toHaveTextContent('A versão 3.1.0 está pronta para instalar');
        expect(
          found.compareDocumentPosition(screen.getByText(/^conteúdo/)) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      }
    );

    it('does not show on /updates, where the screen already says it', async () => {
      renderShell('/updates', state());

      await screen.findByText('conteúdo Atualizações');
      await waitFor(() => expect(window.electron.updateState).toHaveBeenCalled());
      expect(banner()).toBeNull();
    });

    it.each([
      ['idle', { status: 'idle', targetVersion: null }],
      ['downloading', { status: 'downloading' }],
      ['scheduled', { restartScheduled: true, pendingJobs: 2 }],
    ] as const)('does not show when %s', async (_n, overrides) => {
      renderShell('/', state(overrides));

      await waitFor(() => expect(window.electron.updateState).toHaveBeenCalled());
      await screen.findByText('conteúdo Painel');
      expect(banner()).toBeNull();
    });

    it('goes away with Depois and stays away on the same session, across navigation', async () => {
      const { emit } = renderShell('/', state());

      fireEvent.click(await screen.findByRole('button', { name: 'Depois' }));
      expect(banner()).toBeNull();

      emit(state({ percent: 100, transferredBytes: 5 }));
      expect(banner()).toBeNull();
      expect(window.electron.restartToUpdate).not.toHaveBeenCalled();
    });

    it('comes back when the offered version changes (the dismissal was for the older one)', async () => {
      const { emit } = renderShell('/', state());

      fireEvent.click(await screen.findByRole('button', { name: 'Depois' }));
      expect(banner()).toBeNull();

      emit(state({ targetVersion: '3.2.0' }));

      expect(banner()).toHaveTextContent('A versão 3.2.0 está pronta para instalar');
    });

    it('comes back when a scheduled restart is cancelled', async () => {
      const { emit } = renderShell('/', state({ restartScheduled: true, pendingJobs: 1 }));
      await waitFor(() => expect(window.electron.updateState).toHaveBeenCalled());
      expect(banner()).toBeNull();

      emit(state());

      expect(banner()).not.toBeNull();
    });
  });

  describe('the dialog', () => {
    it('opens from the banner, and nothing restarts until it is confirmed', async () => {
      renderShell('/', state());

      fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar agora' }));

      expect(screen.getByRole('dialog', { name: 'Reiniciar para atualizar?' })).toBeInTheDocument();
      expect(window.electron.restartToUpdate).not.toHaveBeenCalled();
    });

    it('opens from the sidebar card', async () => {
      renderShell('/queue', state());

      const card = await screen.findByRole('region', { name: 'Resumo da atualização' });
      fireEvent.click(within(card).getByRole('button', { name: 'Reiniciar e atualizar' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(window.electron.restartToUpdate).not.toHaveBeenCalled();
    });

    it('opens from the sidebar card on /updates too, where the banner is not there', async () => {
      renderShell('/updates', state());

      const card = await screen.findByRole('region', { name: 'Resumo da atualização' });
      fireEvent.click(within(card).getByRole('button', { name: 'Reiniciar e atualizar' }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('takes the pending jobs from the update state', async () => {
      renderShell('/', state({ pendingJobs: 3 }));
      // The queue hook says something else on purpose: the main decides to wait, so its count is the one.
      shell.queue.pending = [{}];

      fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar agora' }));

      expect(
        screen.getByText('Há 3 impressões na fila. O app espera elas terminarem e reinicia sozinho.')
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Reiniciar após a fila' })
      ).toBeInTheDocument();
    });

    it('Cancelar closes it, calls no action and gives the focus back to the banner button', async () => {
      renderShell('/', state());

      const opener = await screen.findByRole('button', { name: 'Reiniciar agora' });
      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(opener).toHaveFocus();
      expect(window.electron.restartToUpdate).not.toHaveBeenCalled();
    });

    it('Esc closes it and gives the focus back to the sidebar button that opened it', async () => {
      renderShell('/queue', state());

      const card = await screen.findByRole('region', { name: 'Resumo da atualização' });
      const opener = within(card).getByRole('button', { name: 'Reiniciar e atualizar' });
      opener.focus();
      fireEvent.click(opener);
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(opener).toHaveFocus();
    });

    it('confirming asks the main process to restart, once, and closes the dialog', async () => {
      renderShell('/', state());

      fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar agora' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reiniciar e atualizar' }));

      await waitFor(() => expect(window.electron.restartToUpdate).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes by itself when the update stops being ready underneath it', async () => {
      const { emit } = renderShell('/', state());

      fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar agora' }));
      emit(state({ restartScheduled: true, pendingJobs: 1 }));

      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('the overlay', () => {
    it('covers the window while restarting, with the offered version', async () => {
      renderShell('/', state({ status: 'restarting' }));

      const overlay = await screen.findByRole('status', { name: 'Instalando a atualização' });
      expect(overlay).toHaveTextContent('Instalando a versão 3.1.0…');
    });

    it('is driven by the status: it goes away on its own when the installer refuses', async () => {
      const { emit } = renderShell('/', state());
      await screen.findByRole('button', { name: 'Reiniciar agora' });
      expect(screen.queryByRole('status', { name: 'Instalando a atualização' })).toBeNull();

      emit(state({ status: 'restarting' }));
      expect(screen.getByRole('status', { name: 'Instalando a atualização' })).toBeInTheDocument();

      emit(state({ status: 'error' }));
      expect(screen.queryByRole('status', { name: 'Instalando a atualização' })).toBeNull();
    });
  });
});
