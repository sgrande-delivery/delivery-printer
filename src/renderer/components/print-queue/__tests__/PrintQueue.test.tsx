import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrintQueue from '../PrintQueue';
import styles from '../PrintQueue.module.css';
import rowStyles from '../QueueRow.module.css';
import tableStyles from '../QueueTable.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import iconStyles from 'renderer/base/Icon.module.css';
import { MessagingContext } from 'renderer/providers/messaging';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import { MAX_ATTEMPTS } from 'shared/queueLimits';
import type { QueueTab } from 'renderer/types/queueTab';
import type { PrintJobSummary } from 'shared/printQueue';

const handleOpen = vi.fn();

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 0,
    status: 'pending',
    createdAt: new Date(2026, 9, 28, 15, 42).getTime(),
    lastError: null,
    deviceName: 'Cozinha',
    copies: 1,
    reprintable: false,
    ...overrides,
  };
}

function failedJob(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return job({ status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'Print job failed', ...overrides });
}

function renderQueue(tab?: QueueTab) {
  return render(
    <MessagingContext.Provider value={{ handleOpen, handleClose: vi.fn() }}>
      <MemoryRouter initialEntries={[{ pathname: '/queue', state: tab ? { tab } : null }]}>
        <PrintQueue />
      </MemoryRouter>
    </MessagingContext.Provider>
  );
}

function withQueue(...jobs: PrintJobSummary[]): void {
  vi.mocked(window.electron.queueState).mockResolvedValue(jobs);
}

describe('PrintQueue', () => {
  beforeEach(() => {
    handleOpen.mockReset();
    vi.mocked(window.electron.queueState).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.retryFailed).mockReset().mockResolvedValue(1);
    vi.mocked(window.electron.discardJob).mockReset().mockResolvedValue(true);
  });

  it('opens on Falhados when something failed, and on Pendentes when not', async () => {
    withQueue(job({ id: 'p' }), failedJob({ id: 'f', label: 'o pedido #7' }));
    const { unmount } = renderQueue();

    expect(await screen.findByText('O pedido #7')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #42')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Falhados · 1' })).toHaveAttribute('aria-selected', 'true');
    unmount();

    withQueue(job({ id: 'p' }));
    renderQueue();

    expect(await screen.findByText('O pedido #42')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pendentes · 1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('the tab in the navigation state wins over the default', async () => {
    withQueue(job({ id: 'p' }), failedJob({ id: 'f', label: 'o pedido #7' }));
    renderQueue('pending');

    expect(await screen.findByText('O pedido #42')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #7')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pendentes · 1' })).toHaveAttribute('aria-selected', 'true');
  });

  it('the operator picks the other tab, with the counts in the labels', async () => {
    withQueue(job({ id: 'p' }), failedJob({ id: 'f', label: 'o pedido #7' }));
    renderQueue();
    await screen.findByText('O pedido #7');

    fireEvent.click(screen.getByRole('tab', { name: 'Pendentes · 1' }));

    expect(screen.getByText('O pedido #42')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #7')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Falhados · 1' }));

    expect(screen.getByText('O pedido #7')).toBeInTheDocument();
    expect(screen.queryByText('O pedido #42')).not.toBeInTheDocument();
  });

  it('a failed row shows the cause and both actions; a pending one shows none', async () => {
    withQueue(job({ id: 'p' }), failedJob({ id: 'f', label: 'o pedido #7' }));
    renderQueue('failed');

    const row = (await screen.findByText('O pedido #7')).closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText(/A impressora não respondeu/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Descartar/ })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
    expect(within(row).getByText(`${MAX_ATTEMPTS}/${MAX_ATTEMPTS}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Pendentes · 1' }));
    expect(screen.queryByRole('button', { name: /Descartar|Tentar de novo/ })).not.toBeInTheDocument();
  });

  it('a pending job with the instant shows the count; without it, the text without a count', async () => {
    withQueue(
      job({ id: 'a', attempts: 2, nextAttemptAt: Date.now() + 18_000, label: 'o pedido #1' }),
      job({ id: 'b', attempts: 3, label: 'o pedido #2' }),
      job({ id: 'c', attempts: 0, label: 'o pedido #3' })
    );
    renderQueue('pending');

    expect(await screen.findByText(/Nova tentativa em \d+ s/)).toBeInTheDocument();
    expect(screen.getByText('Aguardando nova tentativa')).toBeInTheDocument();
    expect(screen.getByText('Imprimindo…')).toBeInTheDocument();
  });

  it('counts down while it is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      withQueue(job({ attempts: 2, nextAttemptAt: Date.now() + 30_000 }));
      renderQueue('pending');
      expect(await screen.findByText('Nova tentativa em 30 s')).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(5000);

      expect(screen.getByText('Nova tentativa em 25 s')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says what an empty tab means, per tab, and the check icon', async () => {
    withQueue(job({ id: 'p' }));
    const { container } = renderQueue('failed');

    expect(await screen.findByText('Nenhuma impressão falhou.')).toBeInTheDocument();
    expect(screen.getByText('check_circle')).toHaveClass(tableStyles.emptyIcon);
    expect(container.querySelector(`.${tableStyles.empty}`)).not.toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Pendentes · 1' }));
    expect(screen.queryByText('Nada esperando para imprimir.')).not.toBeInTheDocument();
  });

  it('empty pending says nothing is waiting', async () => {
    withQueue(failedJob());
    renderQueue('pending');
    await screen.findByRole('tab', { name: 'Falhados · 1' });

    expect(screen.getByText('Nada esperando para imprimir.')).toBeInTheDocument();
  });

  it('shows the test page as Teste', async () => {
    withQueue(job({ kind: 'test', label: 'a página de teste' }));
    renderQueue('pending');

    expect(await screen.findByText('Teste · 15:42')).toBeInTheDocument();
    expect(screen.getByText('receipt_long')).toBeInTheDocument();
  });

  it('warns in singular and plural, only when something failed', async () => {
    withQueue(failedJob({ id: 'a' }));
    const { unmount } = renderQueue();
    expect(await screen.findByText('1 comprovante não saiu')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('não vai sair sozinho. Corrija a causa e tente de novo.');
    unmount();

    withQueue(failedJob({ id: 'a' }), failedJob({ id: 'b' }));
    const second = renderQueue();
    expect(await screen.findByText('2 comprovantes não saíram')).toBeInTheDocument();
    second.unmount();

    withQueue(job());
    renderQueue();
    await screen.findByText('O pedido #42');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('writes the limits from the constants', async () => {
    renderQueue();

    expect(
      await screen.findByText(
        `Cada trabalho tenta até ${MAX_ATTEMPTS} vezes. Comprovantes com mais de 24 h são descartados.`
      )
    ).toBeInTheDocument();
  });

  it('discard asks the main process, tells the operator, and stays on the tab to say it is empty', async () => {
    withQueue(failedJob({ id: 'f' }));
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: /Descartar/ }));
    withQueue();

    await waitFor(() => expect(window.electron.discardJob).toHaveBeenCalledWith('f'));
    await waitFor(() => expect(handleOpen).toHaveBeenCalledWith('O pedido #42 descartado.'));
    expect(await screen.findByText('Nenhuma impressão falhou.')).toBeInTheDocument();
  });

  it('says so when the main process refuses the discard', async () => {
    withQueue(failedJob({ id: 'f' }));
    vi.mocked(window.electron.discardJob).mockResolvedValue(false);
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: /Descartar/ }));

    await waitFor(() => expect(handleOpen).toHaveBeenCalledWith(expect.stringContaining('não foi descartado')));
  });

  it('retry asks the main process for that id and tells the operator', async () => {
    withQueue(failedJob({ id: 'f' }));
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }));

    await waitFor(() => expect(window.electron.retryFailed).toHaveBeenCalledWith('f'));
    await waitFor(() => expect(handleOpen).toHaveBeenCalledWith('O pedido #42 voltou para a fila.'));
  });

  it('after retrying the last failure it stays on Falhados instead of jumping to Pendentes', async () => {
    withQueue(failedJob({ id: 'f' }));
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }));
    withQueue();

    expect(await screen.findByText('Nenhuma impressão falhou.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Falhados · 0' })).toHaveAttribute('aria-selected', 'true');
  });

  it('carries the structural classes and no undefined one', async () => {
    withQueue(failedJob({ id: 'f' }), job({ id: 'p' }));
    const { container } = renderQueue();
    await screen.findByText('O pedido #42');

    const row = screen.getByText('O pedido #42').closest('[role="row"]') as HTMLElement;
    expect(container.firstElementChild).toHaveClass(styles.root);
    expect(screen.getByRole('alert')).toHaveClass(styles.notice);
    expect(screen.getByRole('alert').firstElementChild).toHaveClass(iconStyles.root);
    expect(screen.getByRole('alert').lastElementChild).toHaveClass(styles.noticeText);
    expect(screen.getByRole('tablist').parentElement).toHaveClass(styles.toolbar);
    expect(screen.getByRole('tablist')).toHaveClass(styles.tabs);
    expect(screen.getByRole('tab', { name: 'Falhados · 1' })).toHaveClass(styles.tab, styles.tabActive);
    expect(screen.getByRole('tab', { name: 'Pendentes · 1' })).toHaveClass(styles.tab);
    expect(screen.getByRole('tab', { name: 'Pendentes · 1' })).not.toHaveClass(styles.tabActive);
    expect(screen.getByText(/Cada trabalho tenta/)).toHaveClass(styles.hint);
    expect(screen.getByRole('table')).toHaveClass(tableStyles.table);
    expect(screen.getByText('Trabalho').closest('[role="row"]')).toHaveClass(rowStyles.grid, tableStyles.head);
    expect(row).toHaveClass(rowStyles.grid, rowStyles.row);
    expect(screen.getByText('skillet')).toHaveClass(rowStyles.kindIcon);
    expect(row.querySelector(`.${rowStyles.job}`)).not.toBeNull();
    expect(row.querySelector(`.${rowStyles.jobText}`)).not.toBeNull();
    expect(screen.getByText('O pedido #42')).toHaveClass(rowStyles.title);
    expect(screen.getByText(/Produção · /)).toHaveClass(rowStyles.subtitle);
    expect(screen.getByText('Cozinha')).toHaveClass(rowStyles.printer);
    expect(screen.getByText(`${MAX_ATTEMPTS}/${MAX_ATTEMPTS}`)).toHaveClass(rowStyles.attempts);
    expect(screen.getByText(/A impressora não respondeu/)).toHaveClass(rowStyles.situation, rowStyles.situationErr);
    expect(screen.getByRole('button', { name: /Descartar/ }).parentElement).toHaveClass(rowStyles.actions);
    expect(screen.getByRole('button', { name: /Descartar/ })).toHaveClass(buttonStyles.row, buttonStyles.text);
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toHaveClass(
      buttonStyles.row,
      buttonStyles.containedPrimary
    );
    expectNoUndefinedClasses(container);

    fireEvent.click(screen.getByRole('tab', { name: 'Pendentes · 1' }));
    expect(screen.getByText('Imprimindo…')).toHaveClass(rowStyles.situation);
    expect(screen.getByText('Imprimindo…')).not.toHaveClass(rowStyles.situationErr);
    expectNoUndefinedClasses(container);
  });

  it('the empty state carries its classes', async () => {
    const { container } = renderQueue('pending');
    const text = await screen.findByText('Nada esperando para imprimir.');

    expect(text).toHaveClass(tableStyles.empty);
    expect(text.firstElementChild).toHaveClass(tableStyles.emptyIcon);
    expectNoUndefinedClasses(container);
  });
});
