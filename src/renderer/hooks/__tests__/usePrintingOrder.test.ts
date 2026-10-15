import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrintingOrder } from '../usePrintingOrder';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  handleOpen: vi.fn(),
  socket: { on: vi.fn(), off: vi.fn() },
  state: { isConnected: true },
}));

vi.mock('renderer/services/api', () => ({ api: { get: mocks.get, patch: mocks.patch } }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: mocks.handleOpen }) }));
vi.mock('../useOrderSocket', () => ({
  useOrderSocket: () => ({ socket: mocks.socket, isConnected: mocks.state.isConnected }),
}));

const order = { uuid: 'u-1', sequence: 42 };
const unhandled = vi.fn();

function mockApi(): void {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/orders/print/list') {
      return { data: [order] };
    }
    return { data: [{ content: '<p>x</p>', copies: 1, device_name: null }] };
  });
}

describe('usePrintingOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.isConnected = true;
    mockApi();
    mocks.patch.mockResolvedValue({});
    vi.mocked(window.electron.rawPrint).mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.on('unhandledRejection', unhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
    vi.restoreAllMocks();
  });

  it('avisa o operador quando o PATCH falha depois de imprimir, sem rejeição solta', async () => {
    mocks.patch.mockRejectedValue(new Error('500'));

    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(mocks.handleOpen).toHaveBeenCalledTimes(1));
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('#42');
    expect(window.electron.rawPrint).toHaveBeenCalledTimes(1);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('não reimprime pela varredura o pedido já impresso nesta sessão', async () => {
    mocks.patch.mockRejectedValue(new Error('500'));

    const { rerender } = renderHook(() => usePrintingOrder());
    await waitFor(() => expect(mocks.handleOpen).toHaveBeenCalledTimes(1));

    mocks.state.isConnected = false;
    rerender();
    mocks.state.isConnected = true;
    await act(async () => {
      rerender();
    });

    await waitFor(() => expect(mocks.get.mock.calls.filter(c => c[0] === '/orders/print/list')).toHaveLength(2));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(window.electron.rawPrint).toHaveBeenCalledTimes(1);
  });

  it('não marca como impresso quando a impressão falha', async () => {
    vi.mocked(window.electron.rawPrint).mockRejectedValue(new Error('sem impressora'));

    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(window.electron.rawPrint).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.handleOpen).not.toHaveBeenCalled();
  });

  it('a varredura ainda imprime o print-created que falhou, mesmo após um print-dispatched bem-sucedido', async () => {
    const handlers: Record<string, (payload: unknown) => void> = {};
    mocks.socket.on.mockImplementation((event: string, handler: (payload: unknown) => void) => {
      handlers[event] = handler;
    });
    mocks.state.isConnected = false;

    const { rerender } = renderHook(() => usePrintingOrder());

    vi.mocked(window.electron.rawPrint).mockRejectedValueOnce(new Error('sem impressora'));
    await act(async () => {
      handlers.printOrder(order);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      handlers.printShipment(order);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    mocks.state.isConnected = true;
    await act(async () => {
      rerender();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const createdGets = mocks.get.mock.calls.filter(c => c[0] === `orders/${order.uuid}/print-created`);
    expect(createdGets).toHaveLength(2);
    mocks.socket.on.mockReset();
  });
});
