import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { buildDashboard, startOfDay, useDashboardHealth } from '../useDashboardHealth';
import { fetchPrinters } from 'renderer/services/printers';
import type { ResolvedPrinter } from '../usePrinters';
import type { PrintJobSummary } from 'shared/printQueue';

vi.mock('renderer/services/printers', () => ({ fetchPrinters: vi.fn() }));

// 2026-10-28 15:42, local time.
const NOW = new Date(2026, 9, 28, 15, 42);

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 0,
    status: 'pending',
    createdAt: new Date(2026, 9, 28, 14, 32).getTime(),
    lastError: null,
    deviceName: 'Cozinha',
    copies: 1,
    ...overrides,
  };
}

function printer(overrides: Partial<ResolvedPrinter> = {}): ResolvedPrinter {
  return {
    id: 1,
    name: 'Cozinha',
    address: '',
    activated: true,
    station: 'kitchen',
    paper_width: 80,
    copies: 1,
    resolvedDevice: 'Cozinha',
    ...overrides,
  };
}

function build(input: Partial<Parameters<typeof buildDashboard>[0]> = {}) {
  return buildDashboard({ pending: [], failed: [], printed: [], printers: [], devicesRead: true, now: NOW, ...input });
}

describe('buildDashboard health', () => {
  it('failure wins over a printer not found, even when both happen at once', () => {
    const { health } = build({
      failed: [job({ status: 'failed', lastError: 'print job failed' })],
      printers: [printer({ resolvedDevice: null })],
    });

    expect(health).toMatchObject({ tone: 'err', icon: 'error', action: { label: 'Ver fila', to: '/queue' } });
    expect(health.title).toBe('1 impressão falhou');
    expect(health.subtitle).toBe(
      'O pedido #42 não saiu: a impressora não respondeu (verifique se está ligada, com papel e conectada).'
    );
  });

  it('a printer not found wins over the normal state, and points at the printers screen', () => {
    const { health } = build({
      printed: [job({ status: 'printed' })],
      printers: [printer({ resolvedDevice: null })],
    });

    expect(health).toMatchObject({ tone: 'warn', icon: 'warning', action: { label: 'Corrigir', to: '/printers' } });
    expect(health.title).toBe('1 impressora não encontrada');
    expect(health.subtitle).toBe('Os comprovantes dela vão para a impressora padrão do Windows.');
  });

  it('is normal with nothing wrong, quoting the last receipt of today', () => {
    const { health } = build({
      printed: [
        job({ id: 'a', status: 'printed', createdAt: new Date(2026, 9, 28, 9, 5).getTime() }),
        job({ id: 'b', status: 'printed', kind: 'order-dispatched', label: 'o pedido #77' }),
      ],
      printers: [printer()],
    });

    expect(health).toMatchObject({ tone: 'ok', icon: 'check_circle', action: null });
    expect(health.title).toBe('Imprimindo automaticamente');
    expect(health.subtitle).toBe('Último comprovante: O pedido #77 · Expedição às 14:32');
  });

  it('is normal without quoting any receipt when nothing was printed today', () => {
    const { health } = build({ printers: [printer()] });

    expect(health.tone).toBe('ok');
    expect(health.subtitle).not.toMatch(/Último comprovante/);
    expect(health.subtitle).toBe('Pronto e aguardando pedidos.');
  });

  it('does not quote yesterday as the last receipt', () => {
    const yesterday = new Date(2026, 9, 27, 23, 0).getTime();
    const { health, stats } = build({ printed: [job({ status: 'printed', createdAt: yesterday })] });

    expect(health.subtitle).not.toMatch(/Último comprovante/);
    expect(stats.printedToday).toBe(0);
  });

  it('agrees in number, in one and in two, on the three states', () => {
    expect(build({ failed: [job(), job({ id: 'x' })] }).health.title).toBe('2 impressões falharam');
    expect(build({ failed: [job()] }).health.title).toBe('1 impressão falhou');

    const two = build({ printers: [printer({ resolvedDevice: null }), printer({ id: 2, resolvedDevice: null })] });
    expect(two.health.title).toBe('2 impressoras não encontradas');
    expect(two.health.subtitle).toBe('Os comprovantes delas vão para a impressora padrão do Windows.');
  });

  it('does not accuse any printer when the devices of the machine were not read', () => {
    const { health, chips } = build({ printers: [printer({ resolvedDevice: null })], devicesRead: false });

    expect(health.tone).toBe('ok');
    expect(chips).toEqual([{ id: 1, label: 'Cozinha · Cozinha', dot: 'muted' }]);
  });

  it('names the chip by sector and name, falling back to the raw station and to "Sem setor"', () => {
    const { chips } = build({
      printers: [
        printer({ id: 1, station: 'bar', name: 'Bar 1' }),
        printer({ id: 2, station: 'wok', name: 'W' }),
        printer({ id: 3, station: null, name: 'Z', resolvedDevice: null }),
      ],
    });

    expect(chips.map(chip => chip.label)).toEqual(['Bar · Bar 1', 'wok · W', 'Sem setor · Z']);
    expect(chips.map(chip => chip.dot)).toEqual(['ok', 'ok', 'err']);
  });
});

describe('buildDashboard stats', () => {
  it('counts as printed today from the local midnight on, not the last 24 hours', () => {
    const { stats } = build({
      printed: [
        job({ id: 'ontem', status: 'printed', createdAt: new Date(2026, 9, 27, 23, 0).getTime() }),
        job({ id: 'meia-noite', status: 'printed', createdAt: new Date(2026, 9, 28, 0, 0).getTime() }),
        job({ id: 'hoje', status: 'printed' }),
      ],
      pending: [job({ id: 'p1' }), job({ id: 'p2' })],
      failed: [job({ id: 'f1', status: 'failed' })],
    });

    expect(stats).toEqual({ printedToday: 2, pending: 2, failed: 1 });
    expect(startOfDay(NOW)).toBe(new Date(2026, 9, 28).getTime());
  });
});

describe('useDashboardHealth', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchPrinters).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.queueState).mockReset().mockResolvedValue([]);
    vi.mocked(window.electron.listPrinters).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the queue and the printers of the machine', async () => {
    vi.mocked(window.electron.queueState).mockResolvedValue([job({ status: 'failed' })]);

    const { result } = renderHook(() => useDashboardHealth());

    await waitFor(() => expect(result.current.stats.failed).toBe(1));
    expect(result.current.health.tone).toBe('err');
  });
});
