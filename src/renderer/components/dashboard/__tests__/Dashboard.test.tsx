import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Dashboard from '../Dashboard';
import styles from '../Dashboard.module.css';
import buttonStyles from 'renderer/base/Button.module.css';
import chipStyles from 'renderer/base/Chip.module.css';
import { fetchPrinters } from 'renderer/services/printers';
import { expectNoUndefinedClasses } from 'renderer/__tests__/cssModules';
import type { Printer } from 'renderer/types/printer';
import type { PrintJobSummary } from 'shared/printQueue';

vi.mock('renderer/services/printers', () => ({ fetchPrinters: vi.fn() }));

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 0,
    status: 'pending',
    createdAt: Date.now(),
    lastError: null,
    deviceName: 'Cozinha',
    ...overrides,
  };
}

function printer(name: string, id: number, station: string | null = 'kitchen'): Printer {
  return { id, name, address: '', activated: true, station, paper_width: 80, copies: 1 };
}

function devices(...names: string[]) {
  return names.map(name => ({ name, displayName: name, isDefault: false }));
}

function Where() {
  const { pathname, state } = useLocation();

  return <output data-testid="where">{`${pathname}|${JSON.stringify(state)}`}</output>;
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Dashboard />
      <Where />
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.queueState).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.listPrinters).mockReset().mockResolvedValue(devices('Cozinha'));
  });

  it('shows the normal state without alerting, with the structural classes', async () => {
    const { container } = renderDashboard();

    expect(await screen.findByText('Imprimindo automaticamente')).toBeInTheDocument();
    expect(screen.getByText('Pronto e aguardando pedidos.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver fila' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(styles.root);
    expect(screen.getByText('check_circle').parentElement).toHaveClass(styles.badge, styles.badgeOk);
    expect(screen.getByText('Imprimindo automaticamente')).toHaveClass(styles.title);
    expect(screen.getByText('Imprimindo automaticamente').parentElement).toHaveClass(styles.text);
    expect(screen.getByText('Pronto e aguardando pedidos.')).toHaveClass(styles.subtitle);
    expect(within(screen.getByText('Falharam').parentElement!).getByText('0')).toHaveClass(styles.value);
    expect(screen.getByText('Impressos hoje').parentElement?.parentElement).toHaveClass(styles.stats);
    expect(screen.getByText('Impressos hoje')).toHaveClass(styles.label);
    expect(screen.getByText('Impressos hoje').parentElement).toHaveClass(styles.cell);
    expectNoUndefinedClasses(container);
  });

  it('shows the failure as an alert with the order and the cause, and Ver fila goes to the queue', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([
      job({ id: 'f-1', status: 'failed', lastError: 'print job failed' }),
    ]);
    const { container } = renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('1 impressão falhou');
    expect(alert).toHaveTextContent('O pedido #42 não saiu');
    expect(screen.getByText('error').parentElement).toHaveClass(styles.badgeErr);

    const action = screen.getByRole('button', { name: 'Ver fila' });
    expect(action).toHaveClass(buttonStyles.hero, buttonStyles.containedPrimary);
    fireEvent.click(action);

    expect(screen.getByTestId('where')).toHaveTextContent('/queue|null');
    expectNoUndefinedClasses(container);
  });

  it('shows a printer not found as attention, and Corrigir goes to the printers screen', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Balcão 2', 1)]);
    renderDashboard();

    expect(await screen.findByText('1 impressora não encontrada')).toBeInTheDocument();
    expect(screen.getByText('warning').parentElement).toHaveClass(styles.badgeWarn);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/printers|null');
  });

  it('puts the failure first when a job failed and a printer is not found at once', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([job({ status: 'failed' })]);
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Balcão 2', 1)]);
    renderDashboard();

    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByText(/Balcão 2/)).toHaveClass(chipStyles.root));

    expect(screen.getByText('1 impressão falhou')).toBeInTheDocument();
    expect(screen.queryByText(/impressora não encontrada/)).not.toBeInTheDocument();
  });

  it('paints the failed number only when it is greater than zero', async () => {
    const { unmount } = renderDashboard();
    await screen.findByText('Imprimindo automaticamente');
    expect(within(screen.getByText('Falharam').parentElement!).getByText('0')).not.toHaveClass(styles.valueDanger);
    unmount();

    vi.mocked(window.electron.queueState).mockResolvedValue([job({ status: 'failed' })]);
    renderDashboard();

    await waitFor(() =>
      expect(within(screen.getByText('Falharam').parentElement!).getByText('1')).toHaveClass(styles.valueDanger)
    );
    expect(within(screen.getByText('Na fila').parentElement!).getByText('0')).not.toHaveClass(styles.valueDanger);
  });

  it('counts the three numbers from the queue', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([
      job({ id: 'a', status: 'printed' }),
      job({ id: 'b', status: 'printed' }),
      job({ id: 'c', status: 'printed', createdAt: Date.now() - 3 * 24 * 3600 * 1000 }),
      job({ id: 'd' }),
      job({ id: 'e' }),
      job({ id: 'f' }),
    ]);
    renderDashboard();

    await waitFor(() =>
      expect(within(screen.getByText('Impressos hoje').parentElement!).getByText('2')).toBeInTheDocument()
    );
    expect(within(screen.getByText('Na fila').parentElement!).getByText('3')).toBeInTheDocument();
  });

  it('sends each number where the design sends it, and the queue gets the tab by navigate state', async () => {
    renderDashboard();
    await screen.findByText('Imprimindo automaticamente');

    fireEvent.click(screen.getByRole('button', { name: /Na fila/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/queue|{"tab":"pending"}');

    fireEvent.click(screen.getByRole('button', { name: /Falharam/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/queue|{"tab":"failed"}');

    fireEvent.click(screen.getByRole('button', { name: /Impressos hoje/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/history|null');
  });

  it('shows the printers as chips with sector and name, and the dot of found and not found', async () => {
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha', 1, 'kitchen'), printer('Balcão 2', 2, 'counter')]);
    renderDashboard();

    const found = await screen.findByText('Cozinha · Cozinha');
    const missing = screen.getByText('Balcão · Balcão 2');

    expect(found).toHaveClass(chipStyles.root, chipStyles.large);
    expect(found.parentElement).toHaveClass(styles.chips);
    expect(found.firstElementChild).toHaveClass(chipStyles.dotOk);
    expect(missing.firstElementChild).toHaveClass(chipStyles.dotErr);
  });

  it('keeps the chips neutral and accuses nothing when the machine devices came back empty', async () => {
    vi.mocked(window.electron.listPrinters).mockResolvedValue([]);
    vi.mocked(fetchPrinters).mockResolvedValue([printer('Cozinha', 1)]);
    const { container } = renderDashboard();

    const chip = await screen.findByText('Cozinha · Cozinha');

    expect(chip.firstElementChild).toHaveClass(chipStyles.dotMuted);
    expect(screen.getByText('Imprimindo automaticamente')).toBeInTheDocument();
    expect(screen.queryByText(/não encontrada/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    expectNoUndefinedClasses(container);
  });

  it('does not own the window chrome: no log link, no user, no version', async () => {
    renderDashboard();
    await screen.findByText('Imprimindo automaticamente');

    expect(screen.queryByRole('button', { name: 'abrir logs' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
  });
});
