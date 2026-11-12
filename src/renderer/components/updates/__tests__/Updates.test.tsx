import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UpdateState } from 'shared/appUpdate';
import { AppUpdateContext, type AppUpdateContextValue } from 'renderer/components/layout/appUpdateContext';
import { useAppUpdate } from 'renderer/hooks/useAppUpdate';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import buttonStyles from 'renderer/base/Button.module.css';
import spinnerStyles from 'renderer/base/Spinner.module.css';
import switchStyles from 'renderer/base/Switch.module.css';
import symbol from 'renderer/images/brand/simbolo.svg';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.svg';
import { RestartDialogContext } from 'renderer/components/layout/restartDialogContext';
import Updates from '../Updates';
import styles from '../Updates.module.css';
import cardStyles from '../UpdateCard.module.css';
import notesStyles from '../ReleaseNotesCard.module.css';

const mocks = vi.hoisted(() => ({ handleOpen: vi.fn(), theme: 'light' }));

vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: mocks.handleOpen }) }));
vi.mock('renderer/providers/theme', () => ({ useTheme: () => ({ resolved: mocks.theme }) }));
vi.mock('renderer/services/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function state(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: 'idle',
    currentVersion: '2.7.0',
    targetVersion: null,
    percent: 0,
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

function value(current: UpdateState | null): AppUpdateContextValue {
  return {
    state: current,
    check: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(undefined),
    setAutoDownload: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    cancelRestart: vi.fn().mockResolvedValue(undefined),
  };
}

const openRestartDialog = vi.fn();

function renderUpdates(ctx: AppUpdateContextValue) {
  return render(
    <AppUpdateContext.Provider value={ctx}>
      <RestartDialogContext.Provider value={{ openRestartDialog }}>
        <Updates />
      </RestartDialogContext.Provider>
    </AppUpdateContext.Provider>
  );
}

describe('Updates', () => {
  beforeEach(() => {
    mocks.handleOpen.mockReset();
    openRestartDialog.mockReset();
    mocks.theme = 'light';
  });

  it.each<[string, Partial<UpdateState>, string, keyof AppUpdateContextValue]>([
    ['idle', {}, 'Verificar agora', 'check'],
    ['available', { status: 'available', targetVersion: '2.8.0' }, 'Baixar agora', 'download'],
    [
      'scheduled',
      { status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: 2 },
      'Cancelar',
      'cancelRestart',
    ],
    ['error on download', { status: 'error', targetVersion: '2.8.0' }, 'Tentar novamente', 'download'],
    ['error on check', { status: 'error', targetVersion: null }, 'Tentar novamente', 'check'],
  ])('%s: the button calls the right action of the context', (_name, overrides, label, action) => {
    const ctx = value(state(overrides));
    renderUpdates(ctx);

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(ctx[action]).toHaveBeenCalledTimes(1);
    for (const other of ['check', 'download', 'restart', 'cancelRestart'] as const) {
      if (other !== action) {
        expect(ctx[other]).not.toHaveBeenCalled();
      }
    }
  });

  it('ready: the button opens the confirmation and restarts nothing (RF-05)', () => {
    const ctx = value(state({ status: 'ready', targetVersion: '2.8.0' }));
    renderUpdates(ctx);

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e atualizar' }));

    expect(openRestartDialog).toHaveBeenCalledTimes(1);
    expect(ctx.restart).not.toHaveBeenCalled();
  });

  it('checking: the button is disabled and shows the ring', () => {
    const ctx = value(state({ status: 'checking' }));
    renderUpdates(ctx);

    const button = screen.getByRole('button', { name: 'Verificando…' });
    expect(button).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'carregando' })).toBeInTheDocument();
  });

  it('downloading: no action button, and the bar with percent, megabytes and no invented estimate', () => {
    renderUpdates(
      value(
        state({
          status: 'downloading',
          targetVersion: '2.8.0',
          percent: 40,
          transferredBytes: 18 * 1024 * 1024,
          totalBytes: 45 * 1024 * 1024,
        })
      )
    );

    expect(screen.queryByRole('button', { name: /Baixar|Reiniciar|Verificar|Tentar|Cancelar/ })).toBeNull();
    const bar = screen.getByRole('progressbar', { name: 'Download da atualização' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('40% · 18,0 de 45,0 MB')).toBeInTheDocument();
    expect(screen.queryByText(/cerca de/)).toBeNull();
  });

  it('shows the estimate when the rate is known', () => {
    renderUpdates(
      value(
        state({
          status: 'downloading',
          targetVersion: '2.8.0',
          percent: 50,
          transferredBytes: 20 * 1024 * 1024,
          totalBytes: 40 * 1024 * 1024,
          bytesPerSecond: 2 * 1024 * 1024,
        })
      )
    );

    expect(screen.getByText('cerca de 10 s')).toBeInTheDocument();
  });

  it('shows the strip of the scheduled restart', () => {
    renderUpdates(value(state({ status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: 2 })));

    expect(screen.getByText('Reinicia sozinho quando a fila esvaziar · 2 na fila')).toBeInTheDocument();
    expect(screen.getByText('hourglass_top')).toBeInTheDocument();
  });

  it('says there was no check yet, and the installed version in the name', () => {
    renderUpdates(value(state()));

    expect(screen.getByText('Ainda não houve verificação')).toBeInTheDocument();
    expect(screen.getByText('Delivery Printer 2.7.0')).toBeInTheDocument();
  });

  it('with the state not yet answered shows plain text, not a ring, and no button', () => {
    renderUpdates(value(null));

    expect(screen.getByRole('status')).toHaveTextContent('Lendo o estado da atualização…');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('picks the symbol by theme', () => {
    const { container, unmount } = renderUpdates(value(state()));
    expect(container.querySelector('img')).toHaveAttribute('src', symbol);
    unmount();

    mocks.theme = 'dark';
    const dark = renderUpdates(value(state()));
    expect(dark.container.querySelector('img')).toHaveAttribute('src', symbolNegative);
  });

  describe('the preference', () => {
    it.each([true, false])('reflects autoDownload %s and a click calls setAutoDownload with the opposite', current => {
      const ctx = value(state({ autoDownload: current }));
      renderUpdates(ctx);

      const toggle = screen.getByRole('switch', { name: 'Baixar e atualizar automaticamente' });
      expect(toggle).toHaveAttribute('aria-checked', String(current));

      fireEvent.click(toggle);

      expect(ctx.setAutoDownload).toHaveBeenCalledWith(!current);
    });

    it('says the preference is local and writes the hint of each side', () => {
      const { unmount } = renderUpdates(value(state({ autoDownload: true })));
      expect(screen.getByText(/Vale só neste computador/)).toBeInTheDocument();
      expect(screen.getByText(/sem você precisar clicar/)).toBeInTheDocument();
      unmount();

      renderUpdates(value(state({ autoDownload: false })));
      expect(screen.getByText(/você clica em Baixar/)).toBeInTheDocument();
    });

    it('tells the operator when the channel fails (through the real hook)', async () => {
      vi.mocked(window.electron.updateState).mockResolvedValue(state({ autoDownload: true }));
      vi.mocked(window.electron.setAutoDownloadUpdates).mockRejectedValue(new Error('ipc'));

      const Harness: React.FC = () => {
        const update = useAppUpdate();
        return (
          <AppUpdateContext.Provider value={update}>
            <Updates />
          </AppUpdateContext.Provider>
        );
      };
      render(<Harness />);

      fireEvent.click(await screen.findByRole('switch', { name: 'Baixar e atualizar automaticamente' }));

      await waitFor(() =>
        expect(mocks.handleOpen).toHaveBeenCalledWith('Não foi possível salvar a preferência de atualização.')
      );
    });
  });

  describe('the notices (through the real hook)', () => {
    const Harness: React.FC = () => {
      const update = useAppUpdate();
      return (
        <AppUpdateContext.Provider value={update}>
          <Updates />
        </AppUpdateContext.Provider>
      );
    };

    async function mountedIdle() {
      vi.mocked(window.electron.onUpdateChanged)
        .mockReset()
        .mockReturnValue(() => undefined);
      vi.mocked(window.electron.updateState).mockResolvedValue(state({ lastCheckedAt: 1000 }));
      vi.mocked(window.electron.checkForUpdate).mockResolvedValue(state({ status: 'checking', lastCheckedAt: 1000 }));
      render(<Harness />);
      const check = await screen.findByRole('button', { name: 'Verificar agora' });

      return { check, emit: vi.mocked(window.electron.onUpdateChanged).mock.calls[0][0] };
    }

    it('Verificar agora that ends with no news says so', async () => {
      const { check, emit } = await mountedIdle();

      fireEvent.click(check);
      await waitFor(() => expect(window.electron.checkForUpdate).toHaveBeenCalledTimes(1));
      await screen.findByRole('button', { name: 'Verificando…' });
      act(() => emit(state({ status: 'idle', lastCheckedAt: 2000 })));

      expect(mocks.handleOpen).toHaveBeenCalledWith('Você já está na versão mais recente.');
    });

    it('a check nobody asked for, ending the same way, says nothing', async () => {
      const { emit } = await mountedIdle();

      act(() => emit(state({ status: 'checking', lastCheckedAt: 1000 })));
      act(() => emit(state({ status: 'idle', lastCheckedAt: 2000 })));

      expect(mocks.handleOpen).not.toHaveBeenCalled();
    });

    it('Cancelar on a scheduled restart says it was cancelled', async () => {
      const scheduled = state({ status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: 2 });
      vi.mocked(window.electron.onUpdateChanged)
        .mockReset()
        .mockReturnValue(() => undefined);
      vi.mocked(window.electron.updateState).mockResolvedValue(scheduled);
      vi.mocked(window.electron.cancelRestart).mockResolvedValue({
        ...scheduled,
        restartScheduled: false,
        pendingJobs: 0,
      });
      render(<Harness />);

      fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

      await waitFor(() =>
        expect(mocks.handleOpen).toHaveBeenCalledWith(
          'Reinício cancelado. A atualização será instalada ao fechar o app.'
        )
      );
    });
  });

  describe('the release notes', () => {
    it('renders no card at all without notes', () => {
      renderUpdates(value(state({ targetVersion: '2.8.0', releaseNotes: [] })));

      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByText(/Novidades/)).toBeNull();
    });

    it('renders one li per line, titled with the offered version', () => {
      renderUpdates(
        value(state({ status: 'available', targetVersion: '2.8.0', releaseNotes: ['Um', 'Dois', 'Três'] }))
      );

      const region = screen.getByRole('region', { name: 'Novidades da versão 2.8.0' });
      expect(
        within(region)
          .getAllByRole('listitem')
          .map(li => li.textContent)
      ).toEqual(['Um', 'Dois', 'Três']);
    });

    it('renders markup as text and creates no element from it', () => {
      renderUpdates(
        value(state({ targetVersion: '2.8.0', releaseNotes: ['<b>x</b> e <img src=x onerror=alert(1)>'] }))
      );

      const item = screen.getByRole('listitem');
      expect(item.textContent).toBe('<b>x</b> e <img src=x onerror=alert(1)>');
      expect(item.querySelector('b')).toBeNull();
      expect(item.querySelector('img')).toBeNull();
    });
  });

  it('keeps the structural classes of each element and no undefined class', () => {
    const { container } = renderUpdates(
      value(
        state({
          status: 'ready',
          targetVersion: '2.8.0',
          restartScheduled: true,
          pendingJobs: 1,
          releaseNotes: ['Novidade'],
        })
      )
    );

    expectNoUndefinedClasses(container);
    expect(container.firstElementChild).toHaveClass(styles.root);
    expect(screen.getByRole('region', { name: 'Atualização do aplicativo' })).toHaveClass(cardStyles.root);
    expect(screen.getByText('Delivery Printer 2.7.0')).toHaveClass(cardStyles.name);
    expect(container.querySelector('img')).toHaveClass(cardStyles.symbol);
    // One key per call: toHaveClass drops an undefined argument when another one is a string.
    const status = screen.getByText('A versão 2.8.0 será instalada em seguida').parentElement;
    expect(status).toHaveClass(cardStyles.status);
    expect(status?.firstElementChild).toHaveClass(cardStyles.dot);
    expect(status?.firstElementChild).toHaveClass(cardStyles.dotWarn);
    expect(screen.getByText('hourglass_top').parentElement).toHaveClass(cardStyles.waiting);
    expect(screen.getByText('Ainda não houve verificação')).toHaveClass(cardStyles.lastCheck);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass(buttonStyles.design);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass(buttonStyles.outlined);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveStyle({ height: '36px' });
    expect(screen.getByRole('region', { name: 'Preferências' })).toHaveClass(styles.card);
    expect(screen.getByRole('heading', { name: 'Preferências' })).toHaveClass(styles.cardTitle);
    expect(screen.getByText(/Vale só neste computador/)).toHaveClass(styles.local);
    expect(screen.getByRole('switch')).toHaveClass(switchStyles.root, switchStyles.on);
    expect(screen.getByRole('region', { name: 'Novidades da versão 2.8.0' })).toHaveClass(notesStyles.root);
    expect(screen.getByRole('heading', { name: 'Novidades da versão 2.8.0' })).toHaveClass(notesStyles.title);
    expect(screen.getByRole('list')).toHaveClass(notesStyles.list);
  });

  it('puts the progress classes on the bar, the fill and the text', () => {
    renderUpdates(
      value(state({ status: 'downloading', targetVersion: '2.8.0', percent: 30, totalBytes: 1, transferredBytes: 0 }))
    );

    const track = screen.getByRole('progressbar', { name: 'Download da atualização' });
    expect(track).toHaveClass(cardStyles.track);
    expect(track.firstElementChild).toHaveClass(cardStyles.fill);
    expect(track.firstElementChild).toHaveStyle({ width: '30%' });
    expect(track.nextElementSibling).toHaveClass(cardStyles.progressText);
  });

  it('puts the head, the identity, the progress block and the waiting text in their classes', () => {
    const { container } = renderUpdates(
      value(
        state({
          status: 'downloading',
          targetVersion: '2.8.0',
          percent: 30,
          totalBytes: 1,
          transferredBytes: 0,
        })
      )
    );

    expect(container.querySelector('img')?.parentElement).toHaveClass(cardStyles.head);
    expect(screen.getByText('Delivery Printer 2.7.0').parentElement).toHaveClass(cardStyles.identity);
    expect(screen.getByRole('progressbar').parentElement).toHaveClass(cardStyles.progress);
  });

  it('puts the waiting text in its class', () => {
    renderUpdates(value(state({ status: 'ready', targetVersion: '2.8.0', restartScheduled: true, pendingJobs: 2 })));

    expect(screen.getByText('Reinicia sozinho quando a fila esvaziar · 2 na fila')).toHaveClass(cardStyles.waitingText);
  });

  it('puts the pending class on the text shown before the state arrives', () => {
    renderUpdates(value(null));

    expect(screen.getByRole('status')).toHaveClass(styles.pending);
  });

  describe('the tone of the status dot', () => {
    const dotOf = (text: string) => screen.getByText(text).previousElementSibling;

    it.each<[string, Partial<UpdateState>, string]>([
      ['idle', {}, 'Você está na versão mais recente'],
      ['ready', { status: 'ready', targetVersion: '2.8.0' }, 'A versão 2.8.0 está pronta para instalar'],
    ])('%s is ok', (_name, overrides, text) => {
      renderUpdates(value(state(overrides)));

      expect(dotOf(text)).toHaveClass(cardStyles.dotOk);
    });

    it.each<[string, Partial<UpdateState>, string]>([
      ['available', { status: 'available', targetVersion: '2.8.0' }, 'A versão 2.8.0 está disponível'],
      ['downloading', { status: 'downloading', targetVersion: '2.8.0' }, 'Baixando a versão 2.8.0'],
    ])('%s is accent', (_name, overrides, text) => {
      renderUpdates(value(state(overrides)));

      expect(dotOf(text)).toHaveClass(cardStyles.dotAccent);
    });

    it('error is err', () => {
      renderUpdates(value(state({ status: 'error', targetVersion: '2.8.0', error: 'falha' })));

      const dot = document.querySelector(`.${cardStyles.status} > span:first-child`);
      expect(dot).toHaveClass(cardStyles.dotErr);
    });
  });

  it('asks the Spinner for its 12 px size while checking', () => {
    renderUpdates(value(state({ status: 'checking' })));

    expect(screen.getByRole('progressbar', { name: 'carregando' })).toHaveClass(spinnerStyles.inline);
  });
});
