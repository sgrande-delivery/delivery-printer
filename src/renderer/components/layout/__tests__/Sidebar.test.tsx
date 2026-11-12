import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { shell } from './shellMocks';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import { fetchPrinters } from 'renderer/services/printers';
import { AppUpdateContext, type AppUpdateContextValue } from '../appUpdateContext';
import type { UpdateState } from 'shared/appUpdate';
import Sidebar from '../Sidebar';
import cardStyles from '../SidebarUpdateCard.module.css';
import styles from '../Sidebar.module.css';

vi.mock('renderer/providers/auth', () => ({ useAuth: () => shell.auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/services/printers', () => ({
  fetchPrinters: vi.fn().mockResolvedValue([]),
  updatePrinter: vi.fn(),
  togglePrinterActive: vi.fn(),
}));

const LONG_NAME = 'Pizzaria e Restaurante Bella Massa Artesanal da Praça Central do Bairro';

// null and undefined are values the Restaurant type forbids and the API still returns.
function setRestaurant(name: string | null | undefined): void {
  shell.auth.restaurant = { uuid: 'r-1', is_open: true, name };
}

// The real sidebar and the real hooks: only the borders (HTTP and IPC) are doubles. The await is
// what keeps the printers store from resolving after the test body and warning about act().
async function renderSidebar(): Promise<HTMLElement> {
  const { container } = render(
    <MemoryRouter>
      <Sidebar isConnected />
    </MemoryRouter>
  );

  await waitFor(() => expect(fetchPrinters).toHaveBeenCalled());

  return container;
}

describe('the store name in the sidebar footer', () => {
  beforeEach(() => {
    setRestaurant('Bella Massa');
  });

  it('shows the name inside the footer, with the layout class', async () => {
    const container = await renderSidebar();
    const name = screen.getByText('Bella Massa');

    expect(name).toHaveClass(styles.storeName);
    expect(container.querySelector(`.${styles.footer}`)).toContainElement(name);
    expectNoUndefinedClasses(container);
  });

  it('comes before the user block in the DOM', async () => {
    await renderSidebar();
    const name = screen.getByText('Bella Massa');
    const user = screen.getByText('maria');

    expect(name.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('carries the whole name in the title when it is too long to show', async () => {
    setRestaurant(LONG_NAME);
    await renderSidebar();

    expect(screen.getByText(LONG_NAME)).toHaveAttribute('title', LONG_NAME);
  });

  it.each([null, undefined, ''])('renders no line and no empty container for the name %j', async name => {
    setRestaurant(name);
    const container = await renderSidebar();

    expect(container.querySelector(`.${styles.storeName}`)).toBeNull();
    expect(container.querySelector(`.${styles.footer}`)?.firstElementChild).toHaveClass(styles.status);
  });

  it('survives a session without a restaurant', async () => {
    shell.auth.restaurant = null;
    const container = await renderSidebar();

    expect(container.querySelector(`.${styles.storeName}`)).toBeNull();
    expect(screen.getByText('Loja fechada')).toBeInTheDocument();
  });
});

describe('the width of the sidebar', () => {
  const VAR = '--sidebar-width';
  const readWidth = vi.mocked(window.electron.uiSidebarWidth);
  const saveWidth = vi.mocked(window.electron.setUiSidebarWidth);

  function widthVar(): string {
    return document.documentElement.style.getPropertyValue(VAR);
  }

  function handle(): HTMLElement {
    const element = screen.getByRole('separator');
    // jsdom has no pointer capture; the component calls these on pointerdown.
    element.setPointerCapture = vi.fn();
    element.hasPointerCapture = vi.fn().mockReturnValue(false);
    element.releasePointerCapture = vi.fn();

    return element;
  }

  beforeEach(() => {
    setRestaurant('Bella Massa');
    document.documentElement.style.removeProperty(VAR);
    shell.handleOpen.mockClear();
    readWidth.mockReset().mockResolvedValue(216);
    saveWidth.mockReset().mockImplementation(width => Promise.resolve(width));
  });

  it('applies the saved width to the CSS var and to the handle', async () => {
    readWidth.mockResolvedValue(300);
    await renderSidebar();

    await waitFor(() => expect(widthVar()).toBe('300px'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '300');
  });

  it('clamps a saved width out of the range', async () => {
    readWidth.mockResolvedValue(99999);
    await renderSidebar();

    await waitFor(() => expect(widthVar()).toBe('360px'));
  });

  it.each([
    ['rejected', null],
    ['garbage', 'wide'],
  ])('stays on the default when the read is %s', async (kind, value) => {
    if (kind === 'rejected') {
      readWidth.mockRejectedValue(new Error('ipc'));
    } else {
      // The cast is the case: the channel is typed Promise<number>, the preferences file is edited by hand,
      // and the type is an assertion about the answer, not proof of it.
      readWidth.mockResolvedValue(value as unknown as number);
    }
    await renderSidebar();

    await waitFor(() => expect(readWidth).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '216'));
  });

  it('saves once per drag, with an integer, and adopts what the main kept', async () => {
    saveWidth.mockResolvedValue(250);
    const container = await renderSidebar();
    const element = handle();

    fireEvent.pointerDown(element, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(element, { clientX: 110.4, pointerId: 1 });
    fireEvent.pointerMove(element, { clientX: 120.4, pointerId: 1 });
    fireEvent.pointerMove(element, { clientX: 130.4, pointerId: 1 });
    expect(saveWidth).not.toHaveBeenCalled();
    fireEvent.pointerUp(element, { pointerId: 1 });

    expect(saveWidth).toHaveBeenCalledTimes(1);
    expect(saveWidth).toHaveBeenCalledWith(246);
    await waitFor(() => expect(widthVar()).toBe('250px'));
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '250');
    expect(container.querySelector(`.${styles.root}`)).toBeInTheDocument();
  });

  it('keeps the width on screen and says so when saving fails', async () => {
    saveWidth.mockRejectedValue(new Error('disk'));
    await renderSidebar();

    fireEvent.keyDown(handle(), { key: 'ArrowRight' });

    await waitFor(() => expect(shell.handleOpen).toHaveBeenCalledWith('Não foi possível salvar a largura do menu.'));
    expect(widthVar()).toBe('232px');
  });

  it('puts the handle inside the sidebar, with no undefined class', async () => {
    const container = await renderSidebar();

    expect(container.querySelector('aside')).toContainElement(screen.getByRole('separator'));
    expectNoUndefinedClasses(container);
    await act(async () => undefined);
  });
});

describe('the update card and the version line', () => {
  const READY: UpdateState = {
    status: 'ready',
    currentVersion: '2.7.0',
    targetVersion: '2.8.0',
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
  };

  function context(state: UpdateState | null): AppUpdateContextValue {
    return {
      state,
      check: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(undefined),
      setAutoDownload: vi.fn().mockResolvedValue(undefined),
      restart: vi.fn().mockResolvedValue(undefined),
      cancelRestart: vi.fn().mockResolvedValue(undefined),
    };
  }

  const Where: React.FC = () => <div data-testid="where">{useLocation().pathname}</div>;

  async function renderWith(ctx: AppUpdateContextValue): Promise<HTMLElement> {
    const { container } = render(
      <MemoryRouter initialEntries={['/queue']}>
        <AppUpdateContext.Provider value={ctx}>
          <Sidebar isConnected />
        </AppUpdateContext.Provider>
        <Where />
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalled());

    return container;
  }

  beforeEach(() => {
    setRestaurant('Bella Massa');
    vi.mocked(window.electron.revealLogs).mockReset().mockResolvedValue(true);
  });

  it('shows the ready card, above the connection block and after the store name', async () => {
    const ctx = context(READY);
    const container = await renderWith(ctx);

    const card = screen.getByRole('region', { name: 'Resumo da atualização' });
    expect(card).toHaveClass(cardStyles.root);
    // One assertion per key, each one alone: a list with a single undefined class is what makes the
    // matcher fail, and renaming the key in the .module.css is the only defect this can catch.
    expect(screen.getByRole('button', { name: /Atualização pronta.*v2\.8\.0/ })).toHaveClass(cardStyles.summary);
    expect(screen.getByText('Atualização pronta').parentElement).toHaveClass(cardStyles.texts);
    expect(screen.getByText('Atualização pronta')).toHaveClass(cardStyles.title);
    expect(screen.getByText('v2.8.0')).toHaveClass(cardStyles.subtitle);
    expect(screen.getByRole('button', { name: 'Reiniciar e atualizar' })).toHaveClass(cardStyles.action);
    expect(container.querySelector(`.${styles.footer}`)).toContainElement(card);
    expect(
      screen.getByText('Bella Massa').compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const status = container.querySelector(`.${styles.status}`) as HTMLElement;
    expect(card.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expectNoUndefinedClasses(container);

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar e atualizar' }));
    expect(ctx.restart).toHaveBeenCalledTimes(1);
    expect(ctx.download).not.toHaveBeenCalled();
  });

  it.each([
    ['idle', { status: 'idle' }],
    ['checking', { status: 'checking' }],
    ['restarting', { status: 'restarting' }],
    ['no state yet', null],
  ] as const)('shows no card with %s', async (_name, patch) => {
    await renderWith(context(patch === null ? null : { ...READY, ...patch }));

    expect(screen.queryByRole('region', { name: 'Resumo da atualização' })).toBeNull();
    expect(screen.queryByText('Atualização pronta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reiniciar e atualizar' })).toBeNull();
  });

  it('does not read the card from a default context: without a provider nothing shows', async () => {
    render(
      <MemoryRouter>
        <Sidebar isConnected />
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchPrinters).toHaveBeenCalled());

    expect(screen.queryByRole('region', { name: 'Resumo da atualização' })).toBeNull();
  });

  it('puts one class per tone on the icon', async () => {
    const cases: [Partial<UpdateState>, string, string][] = [
      [{ status: 'ready' }, 'restart_alt', cardStyles.toneAccent],
      [{ status: 'ready', restartScheduled: true, pendingJobs: 2 }, 'hourglass_top', cardStyles.toneWarn],
      [{ status: 'error' }, 'error', cardStyles.toneErr],
    ];

    for (const [patch, icon, tone] of cases) {
      const { unmount } = render(
        <MemoryRouter>
          <AppUpdateContext.Provider value={context({ ...READY, ...patch })}>
            <Sidebar isConnected />
          </AppUpdateContext.Provider>
        </MemoryRouter>
      );
      await waitFor(() => expect(fetchPrinters).toHaveBeenCalled());

      const glyph = screen.getByText(icon);
      expect(tone).toBeTruthy();
      expect(glyph).toHaveClass(tone);
      expect(glyph).toHaveClass(cardStyles.icon);
      unmount();
    }
  });

  it('navigates to /updates from the title of the card, whose name carries both lines', async () => {
    await renderWith(context(READY));

    const summary = screen.getByRole('button', { name: /Atualização pronta.*v2\.8\.0/ });
    // Anchored: both lines and nothing else. The name of the Icon is text, and only its aria-hidden keeps
    // it out of here; the space between the two lines is the browser's, and jsdom does not add it.
    expect(summary).toHaveAccessibleName(/^Atualização pronta\s?v2\.8\.0$/);
    fireEvent.click(summary);

    expect(screen.getByTestId('where')).toHaveTextContent('/updates');
  });

  it('navigates to /updates from the version line, which keeps the installed version', async () => {
    await renderWith(context({ ...READY, status: 'idle' }));

    const line = screen.getByRole('button', { name: /^v\d.* · / });
    expect(line).toHaveClass(styles.versionLink);
    fireEvent.click(line);

    expect(screen.getByTestId('where')).toHaveTextContent('/updates');
  });

  it('keeps "abrir logs" calling revealLogs, without navigating', async () => {
    await renderWith(context({ ...READY, status: 'idle' }));

    fireEvent.click(screen.getByRole('button', { name: 'abrir logs' }));

    expect(window.electron.revealLogs).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where')).toHaveTextContent('/queue');
  });

  it('draws the download bar with the percent as aria-valuenow', async () => {
    await renderWith(context({ ...READY, status: 'downloading', percent: 42.4 }));

    const bar = screen.getByRole('progressbar', { name: 'Download da atualização' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveClass(cardStyles.track);
    expect(bar.firstElementChild).toHaveClass(cardStyles.fill);
    expect(screen.getByText('v2.8.0 · 42%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Baixar|Reiniciar|Cancelar|Tentar/ })).toBeNull();
  });

  it('runs the action of each state through the context', async () => {
    const ctx = context({ ...READY, status: 'available' });
    await renderWith(ctx);

    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));

    expect(ctx.download).toHaveBeenCalledTimes(1);
    expect(ctx.restart).not.toHaveBeenCalled();
  });

  it('retries a check error by checking, without writing vnull', async () => {
    const ctx = context({ ...READY, status: 'error', targetVersion: null, error: 'net' });
    await renderWith(ctx);

    expect(screen.queryByText(/vnull/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(ctx.check).toHaveBeenCalledTimes(1);
    expect(ctx.download).not.toHaveBeenCalled();
  });

  it('cancels a scheduled restart', async () => {
    const ctx = context({ ...READY, restartScheduled: true, pendingJobs: 3 });
    await renderWith(ctx);

    expect(screen.getByText('Aguardando 3 na fila')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(ctx.cancelRestart).toHaveBeenCalledTimes(1);
  });
});
