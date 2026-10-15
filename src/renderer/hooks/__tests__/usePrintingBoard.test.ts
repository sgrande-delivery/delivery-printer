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
    vi.mocked(window.electron.rawPrint).mockResolvedValue(undefined);
  });

  it('avisa na tela e na notificação, uma vez, quando a impressão da mesa falha', async () => {
    vi.mocked(window.electron.rawPrint).mockRejectedValue(
      new Error("Error invoking remote method 'rawPrint': Print job failed")
    );

    renderHook(() => usePrintingBoard());
    await emitPrintBoard();

    expect(mocks.handleOpen).toHaveBeenCalledTimes(1);
    const message = mocks.handleOpen.mock.calls[0][0] as string;
    expect(message).toContain('mesa 7');
    expect(message).toContain('Balcão');
    expect(window.electron.notification).toHaveBeenCalledTimes(1);
    expect(window.electron.notification).toHaveBeenCalledWith(expect.objectContaining({ body: message }));
  });

  it('avisa quando o comprovante da mesa não chega do servidor', async () => {
    mocks.get.mockRejectedValue(new Error('503'));

    renderHook(() => usePrintingBoard());
    await emitPrintBoard();

    expect(mocks.handleOpen.mock.calls[0][0]).toContain('mesa 7');
    expect(window.electron.rawPrint).not.toHaveBeenCalled();
  });

  it('impressão bem-sucedida não gera aviso nenhum', async () => {
    renderHook(() => usePrintingBoard());
    await emitPrintBoard();

    expect(window.electron.rawPrint).toHaveBeenCalledTimes(1);
    expect(mocks.handleOpen).not.toHaveBeenCalled();
    expect(window.electron.notification).not.toHaveBeenCalled();
  });
});
