import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrintJobSummary } from 'shared/printQueue';
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

function summary(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    orderUuid: 'u-1',
    label: 'o pedido #42',
    attempts: 0,
    status: 'printed',
    createdAt: 0,
    lastError: null,
    deviceName: null,
    copies: 1,
    reprintable: false,
    ...overrides,
  };
}

function lastListener(fn: unknown): (job: PrintJobSummary) => void {
  const calls = vi.mocked(fn as typeof window.electron.onJobPrinted).mock.calls;

  return calls[calls.length - 1][0];
}

function socketHandlers(): Record<string, (payload: unknown) => void> {
  const handlers: Record<string, (payload: unknown) => void> = {};
  mocks.socket.on.mockImplementation((event: string, handler: (payload: unknown) => void) => {
    handlers[event] = handler;
  });
  return handlers;
}

const flush = (): Promise<void> => act(async () => new Promise(resolve => setTimeout(resolve, 0)));

describe('usePrintingOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.isConnected = true;
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/orders/print/list') {
        return { data: [order] };
      }
      return { data: [{ content: '<p>x</p>', copies: 1, device_name: 'Cozinha' }] };
    });
    mocks.patch.mockResolvedValue({});
    vi.mocked(window.electron.enqueue).mockResolvedValue('enqueued');
    vi.mocked(window.electron.onJobPrinted).mockReturnValue(() => undefined);
    vi.mocked(window.electron.onJobFailed).mockReturnValue(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.on('unhandledRejection', unhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
    mocks.socket.on.mockReset();
    vi.restoreAllMocks();
  });

  it('enqueues the receipt instead of printing it, for printOrder and printShipment', async () => {
    const handlers = socketHandlers();
    mocks.state.isConnected = false;
    renderHook(() => usePrintingOrder());

    await act(async () => {
      handlers.printOrder(order);
    });
    await act(async () => {
      handlers.printShipment(order);
    });
    await flush();

    expect(window.electron.rawPrint).not.toHaveBeenCalled();
    expect(window.electron.enqueue).toHaveBeenCalledTimes(2);
    expect(window.electron.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'order-created',
        source: 'event',
        orderUuid: 'u-1',
        label: 'o pedido #42',
        items: [
          expect.objectContaining({
            payload: expect.objectContaining({ content: '<p>x</p>', copies: 1, deviceName: 'Cozinha' }),
          }),
        ],
      })
    );
    expect(window.electron.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ kind: 'order-dispatched', source: 'event' })
    );
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('marks the order when the main process says it printed', async () => {
    renderHook(() => usePrintingOrder());

    await act(async () => {
      lastListener(window.electron.onJobPrinted)(summary());
    });

    expect(mocks.patch).toHaveBeenCalledWith('/orders/u-1/printed');
  });

  it('does not mark anything for a board receipt', async () => {
    renderHook(() => usePrintingOrder());

    await act(async () => {
      lastListener(window.electron.onJobPrinted)(summary({ kind: 'board', orderUuid: undefined }));
    });

    expect(mocks.patch).not.toHaveBeenCalled();
  });

  // The test page is not an order: it must never reach PATCH /printed.
  it('does not mark anything for a test page, even if it carried an order uuid', async () => {
    renderHook(() => usePrintingOrder());

    await act(async () => {
      lastListener(window.electron.onJobPrinted)(summary({ kind: 'test', label: 'a página de teste' }));
    });

    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('warns that it will not print again when only the mark failed, without a loose rejection', async () => {
    mocks.patch.mockRejectedValue(new Error('500'));
    renderHook(() => usePrintingOrder());

    await act(async () => {
      lastListener(window.electron.onJobPrinted)(summary());
    });
    await flush();

    expect(mocks.handleOpen).toHaveBeenCalledTimes(1);
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('#42');
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('não sairá de novo');
    expect(window.electron.rawPrint).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('the scan enqueues the pending order and does not mark it', async () => {
    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(window.electron.enqueue).toHaveBeenCalledTimes(1));
    await flush();

    expect(window.electron.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'order-created', source: 'scan' })
    );
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(window.electron.rawPrint).not.toHaveBeenCalled();
  });

  it('after a restart the scan does not duplicate: the queue says it printed, and only the mark is repeated', async () => {
    vi.mocked(window.electron.enqueue).mockResolvedValue('already-printed');

    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/orders/u-1/printed'));
    expect(window.electron.rawPrint).not.toHaveBeenCalled();
    expect(mocks.handleOpen).not.toHaveBeenCalled();
  });

  it('tells the main process about every connection change', async () => {
    const { rerender } = renderHook(() => usePrintingOrder());
    expect(window.electron.notifyConnection).toHaveBeenLastCalledWith(true);

    mocks.state.isConnected = false;
    rerender();
    expect(window.electron.notifyConnection).toHaveBeenLastCalledWith(false);
    await flush();
  });

  it('warns once, on screen and in the notification, when a job fails past the limit', async () => {
    renderHook(() => usePrintingOrder());

    await act(async () => {
      lastListener(window.electron.onJobFailed)(
        summary({ status: 'failed', deviceName: 'Cozinha', lastError: 'Print job failed' })
      );
    });

    expect(mocks.handleOpen).toHaveBeenCalledTimes(1);
    const message = mocks.handleOpen.mock.calls[0][0] as string;
    expect(message).toContain('#42');
    expect(message).toContain('Cozinha');
    expect(message).toContain('impressora não respondeu');
    expect(window.electron.notification).toHaveBeenCalledWith(expect.objectContaining({ body: message }));
    await flush();
  });

  it('warns when the receipt does not come from the server, and enqueues nothing', async () => {
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/orders/print/list') {
        return { data: [order] };
      }
      throw new Error('503');
    });

    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(mocks.handleOpen).toHaveBeenCalledTimes(1));
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('#42');
    expect(window.electron.enqueue).not.toHaveBeenCalled();
    expect(window.electron.notification).toHaveBeenCalledTimes(1);
  });

  it('warns when the queue could not keep the receipt', async () => {
    vi.mocked(window.electron.enqueue).mockRejectedValue(new Error('disk full'));

    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(mocks.handleOpen).toHaveBeenCalledTimes(1));
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('fila de impressão');
  });

  it('a successful enqueue gives no warning at all', async () => {
    renderHook(() => usePrintingOrder());

    await waitFor(() => expect(window.electron.enqueue).toHaveBeenCalled());
    await flush();

    expect(mocks.handleOpen).not.toHaveBeenCalled();
    expect(window.electron.notification).not.toHaveBeenCalled();
  });

  it('removes its listeners on unmount', () => {
    const offPrinted = vi.fn();
    const offFailed = vi.fn();
    vi.mocked(window.electron.onJobPrinted).mockReturnValue(offPrinted);
    vi.mocked(window.electron.onJobFailed).mockReturnValue(offFailed);

    const { unmount } = renderHook(() => usePrintingOrder());
    unmount();

    expect(offPrinted).toHaveBeenCalledTimes(1);
    expect(offFailed).toHaveBeenCalledTimes(1);
    expect(mocks.socket.off).toHaveBeenCalledWith('printOrder');
  });
});
