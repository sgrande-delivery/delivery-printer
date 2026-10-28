import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { shell } from './shellMocks';
import AppShell from '../AppShell';
import StateLayout from '../StateLayout';
import Sidebar from '../Sidebar';
import appShellStyles from '../AppShell.module.css';
import sidebarStyles from '../Sidebar.module.css';
import stateStyles from '../StateLayout.module.css';
import symbol from 'renderer/images/brand/simbolo.png';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.png';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';

vi.mock('renderer/providers/auth', () => ({ useAuth: () => shell.auth }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/providers/theme', () => ({ useTheme: () => ({ resolved: shell.theme }) }));
vi.mock('renderer/hooks/useAdminSocketEvents', () => ({ useAdminSocketEvents: vi.fn() }));
vi.mock('renderer/hooks/useAdminSocket', () => ({ useAdminSocket: () => ({ isConnected: shell.connected }) }));
vi.mock('renderer/hooks/usePrintingOrder', () => ({ usePrintingOrder: vi.fn() }));
vi.mock('renderer/hooks/usePrintingBoard', () => ({ usePrintingBoard: vi.fn() }));
vi.mock('renderer/hooks/usePrintQueue', () => ({ usePrintQueue: () => shell.queue }));
vi.mock('renderer/hooks/usePrinters', () => ({ usePrinters: () => shell.printers }));

const ROUTES: [string, string, string][] = [
  ['Painel', '/', 'Painel'],
  ['Fila', '/queue', 'Fila de impressão'],
  ['Histórico', '/history', 'Histórico de hoje'],
  ['Impressoras', '/printers', 'Impressoras'],
  ['Configurações', '/printer-settings', 'Configurações de impressão'],
  ['Teste de impressão', '/print-test', 'Teste de impressão'],
];

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={
            <AppShell>
              <Outlet />
            </AppShell>
          }
        >
          {ROUTES.map(([, to, title]) => (
            <Route key={to} path={to} element={<p>conteúdo {title}</p>} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function link(label: string): HTMLElement {
  return screen.getByRole('link', { name: new RegExp(`^${label}`) });
}

describe('AppShell', () => {
  beforeEach(() => {
    shell.connected = true;
    shell.auth.restaurant = { uuid: 'r-1', is_open: true };
    shell.auth.user = { id: 1, name: 'maria', email: 'maria@example.com', image: null };
    shell.queue.pending = [];
    shell.queue.failed = [];
    shell.printers.printers = [];
    shell.printers.devicesRead = true;
    shell.handleOpen.mockClear();
    vi.mocked(window.electron.revealLogs).mockClear();
  });

  it('lists the six destinations with the rotulos of the design', () => {
    renderShell();

    for (const [label, to] of ROUTES) {
      expect(link(label)).toHaveAttribute('href', to);
    }
    expect(screen.getAllByRole('link')).toHaveLength(6);
  });

  it.each(ROUTES)('on %s the header says its title and only that item is active', (label, to, title) => {
    renderShell(to);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByText(`conteúdo ${title}`)).toBeInTheDocument();

    for (const [other] of ROUTES) {
      if (other === label) {
        expect(link(other)).toHaveClass(sidebarStyles.itemActive);
      } else {
        expect(link(other)).not.toHaveClass(sidebarStyles.itemActive);
      }
    }
  });

  it('navigates by the sidebar', () => {
    renderShell();

    fireEvent.click(link('Impressoras'));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Impressoras');
    expect(link('Impressoras')).toHaveClass(sidebarStyles.itemActive);
    expect(link('Painel')).not.toHaveClass(sidebarStyles.itemActive);
  });

  it('puts no badge anywhere with an empty queue and every printer found', () => {
    renderShell();

    expect(document.querySelector(`.${sidebarStyles.badge}`)).toBeNull();
  });

  it('shows the failure count on Fila, in the failure color, over the pending one', () => {
    shell.queue.failed = [{}, {}];
    shell.queue.pending = [{}, {}, {}];
    renderShell();

    const badge = within(link('Fila')).getByText('2');
    expect(badge).toHaveClass(sidebarStyles.badge);
    expect(badge).toHaveClass(sidebarStyles.badgeFailed);
    expect(badge).not.toHaveClass(sidebarStyles.badgePending);
  });

  it('shows the pending count on Fila in the neutral color when nothing failed', () => {
    shell.queue.pending = [{}, {}, {}];
    renderShell();

    const badge = within(link('Fila')).getByText('3');
    expect(badge).toHaveClass(sidebarStyles.badgePending);
    expect(badge).not.toHaveClass(sidebarStyles.badgeFailed);
  });

  it('counts on Impressoras the registered printers not found on this machine', () => {
    shell.printers.printers = [{ resolvedDevice: 'EPSON' }, { resolvedDevice: null }, { resolvedDevice: null }];
    renderShell();

    const badge = within(link('Impressoras')).getByText('2');
    expect(badge).toHaveClass(sidebarStyles.badgeFailed);
  });

  it('does not accuse any printer when the devices of the machine could not be read', () => {
    shell.printers.printers = [{ resolvedDevice: null }];
    shell.printers.devicesRead = false;
    renderShell();

    expect(within(link('Impressoras')).queryByText('1')).not.toBeInTheDocument();
  });

  it('says Online when connected and Sem conexão when not, in the header and in the sidebar', () => {
    const { unmount } = renderShell();

    expect(screen.getByText('Online')).toHaveClass(appShellStyles.chipOnline);
    expect(screen.getByText('Conectado ao servidor')).toBeInTheDocument();
    unmount();

    shell.connected = false;
    renderShell();

    expect(screen.getAllByText('Sem conexão')).toHaveLength(2);
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(document.querySelector(`.${appShellStyles.chipOffline}`)).not.toBeNull();
  });

  it('shows the store state', () => {
    shell.auth.restaurant = { uuid: 'r-1', is_open: false };
    renderShell();

    expect(screen.getByText('Loja fechada')).toBeInTheDocument();
  });

  it('shows the user with the initial as avatar, and the version with the architecture', () => {
    renderShell();

    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('m')).toHaveClass(sidebarStyles.avatar);
    expect(screen.getByText(/^v\d+\.\d+\.\d+.* · x64$/)).toBeInTheDocument();
  });

  it('logs out by the button', async () => {
    shell.auth.logout.mockResolvedValue(undefined);
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(shell.auth.logout).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Desconectar' })).toHaveClass(sidebarStyles.logout);
  });

  it('tells the operator when the logout fails', async () => {
    shell.auth.logout.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));

    await waitFor(() =>
      expect(shell.handleOpen).toHaveBeenCalledWith('Não foi possível desconectar. Tente novamente.')
    );
  });

  it('opens the logs folder, and says so when there is no log yet', async () => {
    vi.mocked(window.electron.revealLogs).mockResolvedValueOnce(false);
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'abrir logs' }));

    expect(window.electron.revealLogs).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(shell.handleOpen).toHaveBeenCalledWith('Ainda não há registros para exportar.'));
  });

  it('keeps the drag regions on the classes that declare them, and the buttons on no-drag classes', () => {
    renderShell();

    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass(appShellStyles.header);
    expect(screen.getByAltText('SGrande').parentElement).toHaveClass(sidebarStyles.brand);
    expect(screen.getByRole('button', { name: 'abrir logs' })).toHaveClass(sidebarStyles.logs);
    expect(document.querySelector('main > div')).toHaveClass(appShellStyles.content);
  });

  // The structural classes, asserted by presence against styles.<key>. Not zeal: there is no
  // class concatenation in these three components, so every expectNoUndefinedClasses() below is
  // inert — a wrong key makes React omit the attribute (direct) or cx() drop it (falsy), and
  // neither leaves a class="undefined" to find. These are the keys that carry the layout.
  it('keeps the structural classes of the shell and of the sidebar', () => {
    const { container } = renderShell();

    expect(container.firstElementChild).toHaveClass(appShellStyles.root);
    expect(container.querySelector('main')).toHaveClass(appShellStyles.main);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(appShellStyles.title);
    expect(screen.getByText('Online').firstElementChild).toHaveClass(appShellStyles.chipDot);

    expect(container.querySelector('aside')).toHaveClass(sidebarStyles.root);
    expect(container.querySelector('nav')).toHaveClass(sidebarStyles.nav);
    expect(link('Painel')).toHaveClass(sidebarStyles.item);
    expect(within(link('Painel')).getByText('space_dashboard')).toHaveClass(sidebarStyles.itemIcon);

    const connected = screen.getByText('Conectado ao servidor');
    expect(connected.previousElementSibling).toHaveClass(sidebarStyles.dot, sidebarStyles.dotOk);
    expect(connected.parentElement?.parentElement).toHaveClass(sidebarStyles.status);
    expect(screen.getByText(/^v\d/).parentElement).toHaveClass(sidebarStyles.version);
  });

  it('marks the disconnected dot with the failure class', () => {
    shell.connected = false;
    const { container } = renderShell();
    // Inside the aside: with no connection the header chip says the same thing.
    const aside = container.querySelector('aside') as HTMLElement;

    expect(within(aside).getByText('Sem conexão').previousElementSibling).toHaveClass(
      sidebarStyles.dot,
      sidebarStyles.dotErr
    );
  });

  it('has no undefined class in the shell or in the sidebar', () => {
    const { container } = renderShell();
    expectNoUndefinedClasses(container);

    const alone = render(
      <MemoryRouter>
        <Sidebar isConnected />
      </MemoryRouter>
    );
    expectNoUndefinedClasses(alone.container);
  });
});

describe('StateLayout', () => {
  it('uses the light symbol in the light theme and the negative one in the dark', () => {
    shell.theme = 'light';
    const { unmount } = render(<StateLayout>conteúdo</StateLayout>);
    expect(screen.getByAltText('SGrande')).toHaveAttribute('src', symbol);
    unmount();

    shell.theme = 'dark';
    const { container } = render(<StateLayout>conteúdo</StateLayout>);
    expect(screen.getByAltText('SGrande')).toHaveAttribute('src', symbolNegative);
    expect(container.firstElementChild).toHaveClass(stateStyles.root);
    expect(screen.getByAltText('SGrande')).toHaveClass(stateStyles.symbol);
    expect(screen.getByAltText('SGrande').parentElement).toHaveClass(stateStyles.bar);
    expect(screen.getByText('conteúdo')).toHaveClass(stateStyles.content);
    expectNoUndefinedClasses(container);
    shell.theme = 'light';
  });
});
