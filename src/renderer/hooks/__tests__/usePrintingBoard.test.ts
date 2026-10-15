import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardControlMovement } from 'renderer/types/boardControlMovement';
import { usePrintingBoard } from '../usePrintingBoard';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  handleOpen: vi.fn(),
  socket: { on: vi.fn(), off: vi.fn() },
}));

vi.mock('renderer/services/api', () => ({ api: { get: mocks.get } }));
vi.mock('renderer/providers/messaging', () => ({ useMessaging: () => ({ handleOpen: mocks.handleOpen }) }));
vi.mock('../useBoardSocket', () => ({ useBoardSocket: () => ({ socket: mocks.socket }) }));

const session = { id: 's-1', board_number: '7' } as BoardControlMovement;

async function emitPrintBoard(): Promise<void> {
  const call = mocks.socket.on.mock.calls.find(c => c[0] === 'print_board');
  await act(async () => {
    call?.[1](session);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('usePrintingBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ data: [{ content: '<p>x</p>', copies: 1, device_name: 'Balcão' }] });
    vi.mocked(window.electron.enqueue).mockResolvedValue('enqueued');
  });

  it('enqueues the board receipt instead of printing it, with no orderUuid', async () => {
    renderHook(() => usePrintingBoard());
    await emitPrintBoard();

    expect(window.electron.rawPrint).not.toHaveBeenCalled();
    expect(window.electron.enqueue).toHaveBeenCalledTimes(1);
    const request = vi.mocked(window.electron.enqueue).mock.calls[0][0];
    expect(request).toMatchObject({ kind: 'board', source: 'event', label: expect.stringContaining('mesa 7') });
    expect(request.orderUuid).toBeUndefined();
    expect(request.items).toHaveLength(1);
    expect(request.items[0].payload).toMatchObject({ content: '<p>x</p>', copies: 1, deviceName: 'Balcão' });
    expect(request.items[0].id).toBe(request.items[0].payload.id);
    expect(mocks.handleOpen).not.toHaveBeenCalled();
    expect(window.electron.notification).not.toHaveBeenCalled();
  });

  it('enqueues the billing layout as board-billing', async () => {
    renderHook(() => usePrintingBoard());
    const call = mocks.socket.on.mock.calls.find(c => c[0] === 'print_board_billing');
    await act(async () => {
      call?.[1](session);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(window.electron.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'board-billing' }));
  });

  it('avisa quando o comprovante da mesa não chega do servidor', async () => {
    mocks.get.mockRejectedValue(new Error('503'));

    renderHook(() => usePrintingBoard());
    await emitPrintBoard();

    expect(mocks.handleOpen.mock.calls[0][0]).toContain('mesa 7');
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('servidor');
    expect(window.electron.enqueue).not.toHaveBeenCalled();
  });

  it('avisa quando a fila não consegue guardar o comprovante', async () => {
    vi.mocked(window.electron.enqueue).mockRejectedValue(new Error('disk full'));

    renderHook(() => usePrintingBoard());
    await emitPrintBoard();

    expect(mocks.handleOpen).toHaveBeenCalledTimes(1);
    expect(mocks.handleOpen.mock.calls[0][0]).toContain('fila de impressão');
    expect(window.electron.notification).toHaveBeenCalledTimes(1);
  });
});
