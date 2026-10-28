import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { shell } from './shellMocks';
import AppRoutes from 'renderer/routes/Routes';

// A SocketStore that keeps the shape of the real one (subscribe/getSnapshot/connect/disconnect) without
// opening a socket. Each namespace gets its own instance, as in the hooks (module singletons).
const fake = vi.hoisted(() => {
  const stores: Record<string, { disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }> = {};
  const handlers: Record<string, Record<string, (payload: unknown) => void>> = {};

  class FakeSocketStore {
    private snapshot: { socket: unknown; isConnected: boolean };
    disconnect = vi.fn();
    connect = vi.fn();

    constructor(namespace: string) {
      handlers[namespace] = {};
      this.snapshot = {
        socket: {
          on: (event: string, handler: (payload: unknown) => void) => {
            handlers[namespace][event] = handler;
          },
          off: (event: string) => {
            delete handlers[namespace][event];
          },
          emit: vi.fn(),
        },
        isConnected: true,
      };
      stores[namespace] = this;
    }

    subscribe = () => () => undefined;
    getSnapshot = () => this.snapshot;
  }

  return { stores, handlers, FakeSocketStore };
});

vi.mock('renderer/services/socket-store', () => ({ SocketStore: fake.FakeSocketStore }));

const http = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('renderer/services/api', () => ({ api: http }));
vi.mock('renderer/providers/auth', () => ({
  useAuth: () => ({ ...shell.auth, sessionStatus: 'authenticated', authenticated: true }),
}));
vi.mock('renderer/providers/theme', () => ({ useTheme: () => ({ resolved: 'light' }) }));
// The real route table, with the screens reduced to a marker: what is under test is where the shell sits.
vi.mock('renderer/screens/LoginScreen', () => ({ default: () => <p>tela de login</p> }));
vi.mock('renderer/screens/MainScreen', () => ({ default: () => <p>tela inicial</p> }));
vi.mock('renderer/screens/PrintQueueScreen', () => ({ default: () => <p>tela da fila</p> }));
vi.mock('renderer/screens/HistoryScreen', () => ({ default: () => <p>tela do histórico</p> }));
vi.mock('renderer/screens/PrintersScreen', () => ({ default: () => <p>tela de impressoras</p> }));
vi.mock('renderer/screens/PrinterSettingsScreen', () => ({ default: () => <p>tela de configurações</p> }));
vi.mock('renderer/screens/PrintTestScreen', () => ({ default: () => <p>tela de teste</p> }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: shell.handleOpen }) }));
vi.mock('renderer/hooks/usePrinters', () => ({ usePrinters: () => shell.printers }));

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AppRoutes />
    </MemoryRouter>
  );
}

describe('the AppShell owns the sockets (RN-06)', () => {
  beforeEach(() => {
    // The stores are module singletons: what the previous test's cleanup called is still on them.
    for (const store of Object.values(fake.stores)) {
      store.connect.mockClear();
      store.disconnect.mockClear();
    }
    shell.printers.printers = [];
    http.get.mockReset().mockImplementation(async (url: string) => {
      if (url === '/orders/print/list') {
        return { data: [] };
      }
      return { data: [{ content: '<p>x</p>', copies: 1, device_name: 'Cozinha' }] };
    });
    vi.mocked(window.electron.enqueue).mockClear();
  });

  it('connects the three namespaces on mount and does not disconnect any when the operator navigates', () => {
    renderApp();

    for (const namespace of ['admin', 'order', 'board']) {
      expect(fake.stores[namespace].connect).toHaveBeenCalledWith('r-1');
    }

    fireEvent.click(screen.getByRole('link', { name: /^Impressoras/ }));
    expect(screen.getByText('tela de impressoras')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: /^Painel/ }));
    expect(screen.getByText('tela inicial')).toBeInTheDocument();

    for (const namespace of ['admin', 'order', 'board']) {
      expect(fake.stores[namespace].disconnect).not.toHaveBeenCalled();
    }
  });

  it('disconnects them only when the shell itself goes away', () => {
    const { unmount } = renderApp();

    unmount();

    for (const namespace of ['admin', 'order', 'board']) {
      // /admin is read twice inside the shell (useAdminSocket and useAdminSocketEvents): both unmount together.
      expect(fake.stores[namespace].disconnect).toHaveBeenCalled();
    }
  });

  it('still prints a printOrder that arrives while the operator is on another screen', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('link', { name: /^Impressoras/ }));

    expect(fake.handlers.order.printOrder).toBeTypeOf('function');
    await act(async () => {
      fake.handlers.order.printOrder({ uuid: 'u-1', sequence: 42 });
    });

    expect(http.get).toHaveBeenCalledWith('orders/u-1/print-created');
    expect(window.electron.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'order-created', source: 'event', orderUuid: 'u-1' })
    );
  });

  it('keeps one listener per event after navigating back and forth', () => {
    renderApp();
    const first = fake.handlers.order.printOrder;

    fireEvent.click(screen.getByRole('link', { name: /^Impressoras/ }));
    fireEvent.click(screen.getByRole('link', { name: /^Painel/ }));

    expect(fake.handlers.order.printOrder).toBe(first);
  });
});
