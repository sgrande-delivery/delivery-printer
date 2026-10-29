import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import History from '../History';
import { MIDNIGHT_CHECK_MS } from 'renderer/hooks/useMidnightTick';
import styles from '../History.module.css';
import rowStyles from '../HistoryRow.module.css';
import tableStyles from '../HistoryTable.module.css';
import chipStyles from 'renderer/base/Chip.module.css';
import iconStyles from 'renderer/base/Icon.module.css';
import { MessagingContext } from 'renderer/providers/messaging';
import { api } from 'renderer/services/api';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { PrintJobSummary } from 'shared/printQueue';

vi.mock('renderer/services/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));

const handleOpen = vi.fn();

function atToday(hour: number, minute = 0): number {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);

  return d.getTime();
}

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 1,
    status: 'printed',
    createdAt: atToday(0, 1),
    lastError: null,
    deviceName: 'Cozinha',
    copies: 1,
    reprintable: true,
    ...overrides,
  };
}

function renderHistory() {
  return render(
    <MessagingContext.Provider value={{ handleOpen, handleClose: vi.fn() }}>
      <History />
    </MessagingContext.Provider>
  );
}

function withQueue(...jobs: PrintJobSummary[]): void {
  vi.mocked(window.electron.queueState).mockResolvedValue(jobs);
}

const closestRow = (cell: HTMLElement): HTMLElement => cell.closest('[role="row"]') as HTMLElement;
const rowOf = (text: string): HTMLElement => closestRow(screen.getByText(text));

describe('History', () => {
  beforeEach(() => {
    handleOpen.mockReset();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.patch).mockReset();
    vi.mocked(window.electron.queueState).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.reprintJob).mockReset().mockResolvedValue(true);
  });

  it('lists only what came out today: yesterday at 23h is in the file and not on screen', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 0, 0, 0);
    withQueue(job({ id: 'a' }), job({ id: 'b', label: 'o pedido #7', createdAt: yesterday.getTime() }));
    renderHistory();

    expect(await screen.findByText('O pedido #42')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #7')).not.toBeInTheDocument();
  });

  it('lists the newest first', async () => {
    withQueue(
      job({ id: 'a', label: 'o pedido #1', createdAt: atToday(0, 1) }),
      job({ id: 'b', label: 'o pedido #2', createdAt: atToday(0, 5) })
    );
    renderHistory();
    await screen.findByText('O pedido #1');

    const titles = screen
      .getAllByRole('row')
      .slice(1)
      .map(r => r.textContent);

    expect(titles[0]).toContain('O pedido #2');
    expect(titles[1]).toContain('O pedido #1');
  });

  it('searches by the order without case', async () => {
    withQueue(job({ id: 'a' }), job({ id: 'b', label: 'a mesa 7', kind: 'board' }));
    renderHistory();
    await screen.findByText('O pedido #42');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar pedido ou mesa' }), { target: { value: 'MESA' } });

    expect(screen.getByText('A mesa 7')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #42')).not.toBeInTheDocument();
  });

  it('each filter shows its own, and Falhas shows the failed', async () => {
    withQueue(
      job({ id: 'a' }),
      job({ id: 'b', label: 'a mesa 7', kind: 'board' }),
      job({ id: 'c', label: 'o pedido #9', status: 'failed' }),
      job({ id: 'd', label: 'a página de teste', kind: 'test' })
    );
    renderHistory();
    await screen.findByText('O pedido #42');

    fireEvent.click(screen.getByRole('button', { name: 'Mesa' }));
    expect(screen.getByText('A mesa 7')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #42')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Falhas' }));
    expect(screen.getByText('O pedido #9')).toBeInTheDocument();
    expect(screen.queryByText('A mesa 7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Teste' }));
    expect(screen.getByText('A página de teste')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #9')).not.toBeInTheDocument();
  });

  it('marks the active filter as pressed', async () => {
    withQueue(job());
    renderHistory();
    await screen.findByText('O pedido #42');

    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Expedição' }));
    expect(screen.getByRole('button', { name: 'Expedição' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('says which day it is and how many came out and failed', async () => {
    withQueue(job({ id: 'a' }), job({ id: 'b', status: 'failed' }));
    renderHistory();

    expect(await screen.findByText(/^Hoje, \d+ [a-z]{3} · 1 impresso · 1 falha$/)).toBeInTheDocument();
  });

  it('writes a null device as the default printer', async () => {
    withQueue(job({ deviceName: null, copies: 2 }));
    renderHistory();

    const row = closestRow(await screen.findByText('O pedido #42'));
    expect(within(row).getByText('Impressora padrão')).toBeInTheDocument();
    expect(within(row).getByText('2×')).toBeInTheDocument();
  });

  it('reprint asks the main by id, says where it went, and never touches the API', async () => {
    withQueue(job({ id: 'abc' }));
    renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: 'Reimprimir O pedido #42' }));

    await waitFor(() => expect(handleOpen).toHaveBeenCalledWith('O pedido #42 enviado para Cozinha.'));
    expect(window.electron.reprintJob).toHaveBeenCalledWith('abc');
    expect(window.electron.rawPrint).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('tells the operator when the main refused', async () => {
    vi.mocked(window.electron.reprintJob).mockResolvedValue(false);
    withQueue(job());
    renderHistory();

    fireEvent.click(await screen.findByRole('button', { name: 'Reimprimir O pedido #42' }));

    await waitFor(() => expect(handleOpen).toHaveBeenCalledWith(expect.stringContaining('não pôde ser reimpresso')));
  });

  it('a row without HTML has no reprint button, and says why on hover', async () => {
    withQueue(job({ id: 'a' }), job({ id: 'b', label: 'o pedido #1', reprintable: false }));
    renderHistory();

    const bare = closestRow(await screen.findByText('O pedido #1'));
    expect(within(bare).queryByRole('button')).not.toBeInTheDocument();
    expect(bare.querySelector('[title^="Só os"]')).not.toBeNull();
    expect(within(rowOf('O pedido #42')).getByRole('button', { name: /Reimprimir/ })).toBeInTheDocument();
  });

  it('is not the empty message while the queue has not answered, and is once it did', async () => {
    let answer: (jobs: PrintJobSummary[]) => void = () => undefined;
    vi.mocked(window.electron.queueState).mockReturnValue(new Promise(resolve => (answer = resolve)));
    renderHistory();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Nada foi impresso hoje.')).not.toBeInTheDocument();

    answer([]);

    expect(await screen.findByText('Nada foi impresso hoje.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('tells a filter that left nothing apart from an empty day', async () => {
    withQueue(job());
    renderHistory();
    await screen.findByText('O pedido #42');

    fireEvent.click(screen.getByRole('button', { name: 'Falhas' }));

    expect(screen.getByText('Nenhum comprovante com esse filtro.')).toBeInTheDocument();
  });

  it('applies the structural classes of the design, one element each', async () => {
    withQueue(job());
    const { container } = renderHistory();
    const row = closestRow(await screen.findByText('O pedido #42'));

    expect(container.firstElementChild).toHaveClass(styles.root);
    expect(screen.queryByText('Nada foi impresso hoje.')).not.toBeInTheDocument();
    expect(container.querySelector(`.${styles.toolbar}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.search}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.searchIcon}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.searchInput}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.filters}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.summary}`)).not.toBeNull();
    expect(screen.getByRole('table')).toHaveClass(tableStyles.table);
    expect(screen.getAllByRole('row')[0]).toHaveClass(tableStyles.head);
    expect(screen.getAllByRole('row')[0]).toHaveClass(rowStyles.grid);
    expect(row).toHaveClass(rowStyles.grid);
    expect(row).toHaveClass(rowStyles.row);
    expect(row.querySelector(`.${rowStyles.time}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.order}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.kind}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.printer}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.copies}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.situation}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.action}`)).not.toBeNull();
    expect(within(row).getByRole('button')).toHaveClass(rowStyles.reprint);
    expect(within(row).getByRole('button')).toHaveAttribute('title', 'Reimprimir');
    expect(row.querySelector(`.${iconStyles.root}`)).not.toBeNull();
    expect(within(row).getByText('Impresso')).toHaveClass(chipStyles.compact);
    expect(within(row).getByText('Impresso')).toHaveClass(chipStyles.ok);
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveClass(chipStyles.inverse);
    expect(screen.getByRole('button', { name: 'Mesa' })).toHaveClass(chipStyles.muted);
    expectNoUndefinedClasses(container);
  });

  it('the empty message sits in its own box of the table', async () => {
    renderHistory();

    const message = await screen.findByText('Nada foi impresso hoje.');

    expect(message).toHaveClass(tableStyles.empty);
  });

  it('crosses midnight with the screen otherwise idle', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });

    try {
      vi.setSystemTime(new Date(2026, 9, 28, 23, 59, 30));
      withQueue(job({ createdAt: new Date(2026, 9, 28, 23, 58).getTime() }));
      renderHistory();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText('O pedido #42')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(MIDNIGHT_CHECK_MS * 2);
      });

      expect(screen.queryByText('O pedido #42')).not.toBeInTheDocument();
      expect(screen.getByText('Nada foi impresso hoje.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed row wears the error chip, and the placeholder of a row without button its class', async () => {
    withQueue(job({ status: 'failed', reprintable: false }));
    const { container } = renderHistory();
    const row = closestRow(await screen.findByText('O pedido #42'));

    expect(within(row).getByText('Falhou')).toHaveClass(chipStyles.err);
    expect(row.querySelector(`.${rowStyles.unavailable}`)).not.toBeNull();
    expectNoUndefinedClasses(container);
  });
});
