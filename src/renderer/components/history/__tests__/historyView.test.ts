import { describe, expect, it } from 'vitest';
import {
  HISTORY_FILTERS,
  buildHistoryRows,
  emptyText,
  filterJobs,
  reprintMessage,
  summaryText,
  todaysJobs,
  unavailableReprintHint,
} from '../historyView';
import { KEEP_PRINTED_HTML } from 'shared/queueLimits';
import type { PrintJobSummary } from 'shared/printQueue';

const NOW = new Date(2026, 9, 28, 15, 42);

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 1,
    status: 'printed',
    createdAt: new Date(2026, 9, 28, 14, 0).getTime(),
    lastError: null,
    deviceName: 'Cozinha',
    copies: 1,
    reprintable: true,
    ...overrides,
  };
}

describe('todaysJobs', () => {
  it('keeps what is printed or failed since the local midnight, and drops yesterday', () => {
    const jobs = [
      job({ id: 'today' }),
      job({ id: 'midnight', createdAt: new Date(2026, 9, 28, 0, 0).getTime() }),
      job({ id: 'yesterday', createdAt: new Date(2026, 9, 27, 23, 0).getTime() }),
    ];

    expect(todaysJobs(jobs, NOW).map(j => j.id)).toEqual(['today', 'midnight']);
  });

  it('leaves out the pending ones, which belong to the queue screen', () => {
    const jobs = [job({ id: 'p', status: 'pending' }), job({ id: 'f', status: 'failed' }), job({ id: 'ok' })];

    expect(
      todaysJobs(jobs, NOW)
        .map(j => j.id)
        .sort()
    ).toEqual(['f', 'ok']);
  });

  it('orders newest first, whatever the order it came in', () => {
    const at = (h: number): number => new Date(2026, 9, 28, h, 0).getTime();
    const jobs = [
      job({ id: 'b', createdAt: at(10) }),
      job({ id: 'c', createdAt: at(12) }),
      job({ id: 'a', createdAt: at(8) }),
    ];

    expect(todaysJobs(jobs, NOW).map(j => j.id)).toEqual(['c', 'b', 'a']);
  });

  it('crosses midnight with the clock it is given', () => {
    const jobs = [job({ createdAt: new Date(2026, 9, 28, 23, 58).getTime() })];

    expect(todaysJobs(jobs, new Date(2026, 9, 28, 23, 59))).toHaveLength(1);
    expect(todaysJobs(jobs, new Date(2026, 9, 29, 0, 1))).toHaveLength(0);
  });
});

describe('filterJobs', () => {
  const jobs = [
    job({ id: 'prod', label: 'o pedido #42' }),
    job({ id: 'exp', kind: 'order-dispatched', label: 'o pedido #43' }),
    job({ id: 'mesa', kind: 'board', label: 'a mesa 7' }),
    job({ id: 'conta', kind: 'board-billing', label: 'a conta da mesa 7' }),
    job({ id: 'teste', kind: 'test', label: 'a página de teste' }),
    job({ id: 'falha', status: 'failed', kind: 'board', label: 'a mesa 9' }),
  ];
  const ids = (filter: Parameters<typeof filterJobs>[1], search = ''): string[] =>
    filterJobs(jobs, filter, search).map(j => j.id);

  it('has the seven filters, in the order of the design with Teste before Falhas', () => {
    expect(HISTORY_FILTERS.map(f => f.label)).toEqual([
      'Todos',
      'Produção',
      'Expedição',
      'Mesa',
      'Conta da mesa',
      'Teste',
      'Falhas',
    ]);
  });

  it('each kind shows only its own', () => {
    expect(ids('order-created')).toEqual(['prod']);
    expect(ids('order-dispatched')).toEqual(['exp']);
    expect(ids('board')).toEqual(['mesa', 'falha']);
    expect(ids('board-billing')).toEqual(['conta']);
    expect(ids('test')).toEqual(['teste']);
  });

  it('Falhas shows only the failed, of any kind; Todos shows everything', () => {
    expect(ids('failed')).toEqual(['falha']);
    expect(ids('all')).toHaveLength(6);
  });

  it('searches the label without case, and trims the query', () => {
    expect(ids('all', '  PEDIDO #42 ')).toEqual(['prod']);
    expect(ids('all', 'MESA 7')).toEqual(['mesa', 'conta']);
  });

  it('matches a label that is itself capitalized', () => {
    const shouting = [job({ label: 'A Mesa 7' })];

    expect(filterJobs(shouting, 'all', 'mesa 7')).toHaveLength(1);
  });

  it('the search and the filter narrow together', () => {
    expect(ids('board', 'mesa 7')).toEqual(['mesa']);
    expect(ids('failed', 'mesa 7')).toEqual([]);
  });

  it('a job without a label only matches the empty search', () => {
    const bare = [job({ label: undefined })];

    expect(filterJobs(bare, 'all', '')).toHaveLength(1);
    expect(filterJobs(bare, 'all', 'x')).toHaveLength(0);
  });
});

describe('summaryText', () => {
  it('names the day and counts the printed, with the plural right', () => {
    expect(summaryText([job(), job({ id: 'b' })], NOW)).toBe('Hoje, 28 out · 2 impressos');
    expect(summaryText([job()], NOW)).toBe('Hoje, 28 out · 1 impresso');
    expect(summaryText([], NOW)).toBe('Hoje, 28 out · 0 impressos');
  });

  it('adds the failures only when there are, in the singular and in the plural', () => {
    expect(summaryText([job(), job({ id: 'f', status: 'failed' })], NOW)).toBe('Hoje, 28 out · 1 impresso · 1 falha');
    expect(summaryText([job({ id: 'f', status: 'failed' }), job({ id: 'g', status: 'failed' })], NOW)).toBe(
      'Hoje, 28 out · 0 impressos · 2 falhas'
    );
  });

  it('uses the month of the date it is given', () => {
    expect(summaryText([], new Date(2026, 0, 5))).toBe('Hoje, 5 jan · 0 impressos');
    expect(summaryText([], new Date(2026, 11, 31))).toBe('Hoje, 31 dez · 0 impressos');
  });
});

describe('buildHistoryRows', () => {
  it('writes a null device as the default printer, and the copies as N×', () => {
    const [row] = buildHistoryRows([job({ deviceName: null, copies: 2 })]);

    expect(row.printer).toBe('Impressora padrão');
    expect(row.copies).toBe('2×');
  });

  it('names the situation and the kind, and carries reprintable as the main said', () => {
    const [ok, failed] = buildHistoryRows([
      job({ kind: 'board-billing' }),
      job({ id: 'f', status: 'failed', reprintable: false }),
    ]);

    expect(ok).toMatchObject({ situation: 'Impresso', failed: false, kindLabel: 'Conta da mesa', reprintable: true });
    expect(failed).toMatchObject({ situation: 'Falhou', failed: true, reprintable: false });
  });

  it('capitalizes the title and has a fallback for a job without a label', () => {
    const [named, bare] = buildHistoryRows([job(), job({ id: 'b', label: undefined })]);

    expect(named.title).toBe('O pedido #42');
    expect(bare.title).toBe('Um comprovante');
  });
});

describe('texts', () => {
  it('tells an empty day apart from a filter that left nothing', () => {
    expect(emptyText(false, false)).toBe('Nada foi impresso hoje.');
    expect(emptyText(true, false)).toBe('Nada foi impresso hoje.');
    expect(emptyText(true, true)).toBe('Nenhum comprovante com esse filtro.');
    expect(emptyText(false, true)).toBe('Nada foi impresso hoje.');
  });

  it('derives the reprint window from the limit the store enforces', () => {
    expect(unavailableReprintHint()).toContain(String(KEEP_PRINTED_HTML));
    expect(unavailableReprintHint(5)).toContain('5');
  });

  it('confirms with the printer, or says it was not accepted', () => {
    expect(reprintMessage('O pedido #42', 'Cozinha', true)).toBe('O pedido #42 enviado para Cozinha.');
    expect(reprintMessage('O pedido #42', 'Cozinha', false)).toContain('não pôde ser reimpresso');
  });
});
