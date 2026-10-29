import { describe, expect, it } from 'vitest';
import { RECEIPT_KINDS } from 'renderer/helpers/receiptKind';
import { MAX_AGE_MS, MAX_ATTEMPTS } from 'shared/queueLimits';
import type { PrintJobSummary } from 'shared/printQueue';
import {
  buildRows,
  discardMessage,
  emptyText,
  failedHeadline,
  hasCountdown,
  limitHint,
  resolveTab,
  retryMessage,
  situationOf,
} from '../queueView';

const NOW = new Date(2026, 9, 28, 15, 42, 0).getTime();

function job(overrides: Partial<PrintJobSummary> = {}): PrintJobSummary {
  return {
    id: 'j-1',
    kind: 'order-created',
    label: 'o pedido #42',
    attempts: 0,
    status: 'pending',
    createdAt: NOW,
    lastError: null,
    deviceName: 'Cozinha',
    copies: 1,
    reprintable: false,
    ...overrides,
  };
}

describe('resolveTab', () => {
  it('goes to Falhados when something failed and Pendentes when not', () => {
    expect(resolveTab(null, undefined, 1)).toBe('failed');
    expect(resolveTab(null, undefined, 0)).toBe('pending');
  });

  it('the navigation state wins over the default, and the operator wins over both', () => {
    expect(resolveTab(null, 'pending', 3)).toBe('pending');
    expect(resolveTab(null, 'failed', 0)).toBe('failed');
    expect(resolveTab('pending', 'failed', 3)).toBe('pending');
  });

  it('ignores a navigation state that is not a tab', () => {
    expect(resolveTab(null, 'history', 0)).toBe('pending');
    expect(resolveTab(null, { tab: 'failed' }, 0)).toBe('pending');
  });
});

describe('texts', () => {
  it('says the failure in singular and plural', () => {
    expect(failedHeadline(1)).toBe('1 comprovante não saiu');
    expect(failedHeadline(2)).toBe('2 comprovantes não saíram');
  });

  it('derives the limit text from the constants, not from numbers typed twice', () => {
    expect(limitHint()).toBe(
      `Cada trabalho tenta até ${MAX_ATTEMPTS} vezes. Comprovantes com mais de ${MAX_AGE_MS / 3_600_000} h são descartados.`
    );
    expect(limitHint(7, 48 * 3_600_000)).toBe(
      'Cada trabalho tenta até 7 vezes. Comprovantes com mais de 48 h são descartados.'
    );
  });

  it('has the empty text of each tab', () => {
    expect(emptyText('failed')).toBe('Nenhuma impressão falhou.');
    expect(emptyText('pending')).toBe('Nada esperando para imprimir.');
  });

  it('the messages name the receipt, and the refused discard says why', () => {
    expect(discardMessage('Pedido #42', true)).toBe('Pedido #42 descartado.');
    expect(discardMessage('Pedido #42', false)).toContain('não foi descartado');
    expect(retryMessage('Pedido #42')).toBe('Pedido #42 voltou para a fila.');
  });
});

describe('situationOf', () => {
  it('a failed job shows the cause in the error tone', () => {
    expect(situationOf(job({ status: 'failed', attempts: 5, lastError: 'Print job failed' }), NOW)).toEqual({
      icon: 'error',
      text: 'A impressora não respondeu (verifique se está ligada, com papel e conectada)',
      tone: 'err',
    });
  });

  it('a failed job without a recorded cause does not invent one', () => {
    expect(situationOf(job({ status: 'failed', lastError: null }), NOW).text).toBe('Motivo desconhecido');
  });

  it('counts down to the instant the main process sent, rounding up', () => {
    expect(situationOf(job({ attempts: 2, nextAttemptAt: NOW + 18_000 }), NOW)).toEqual({
      icon: 'schedule',
      text: 'Nova tentativa em 18 s',
      tone: 'muted',
    });
    expect(situationOf(job({ attempts: 2, nextAttemptAt: NOW + 17_001 }), NOW).text).toBe('Nova tentativa em 18 s');
  });

  it('is printing when the instant has come, and never shows 0 s or a negative count', () => {
    expect(situationOf(job({ attempts: 2, nextAttemptAt: NOW }), NOW)).toMatchObject({
      icon: 'print',
      text: 'Imprimindo…',
    });
    expect(situationOf(job({ attempts: 2, nextAttemptAt: NOW - 5000 }), NOW).text).toBe('Imprimindo…');
  });

  it('without the instant, a job that already failed says it waits, with no count', () => {
    expect(situationOf(job({ attempts: 3 }), NOW)).toEqual({
      icon: 'schedule',
      text: 'Aguardando nova tentativa',
      tone: 'muted',
    });
  });

  it('a job that never failed is printing', () => {
    expect(situationOf(job({ attempts: 0 }), NOW)).toMatchObject({ icon: 'print', text: 'Imprimindo…' });
  });
});

describe('buildRows', () => {
  it('builds the row from the kind table, the label and the clock', () => {
    const [row] = buildRows([job({ kind: 'board-billing', label: 'a mesa 7', attempts: 3, status: 'failed' })], NOW);

    expect(row).toMatchObject({
      id: 'j-1',
      failed: true,
      kindIcon: RECEIPT_KINDS['board-billing'].icon,
      title: 'A mesa 7',
      subtitle: 'Conta da mesa · 15:42',
      printer: 'Cozinha',
      attempts: `3/${MAX_ATTEMPTS}`,
    });
  });

  it('names the default printer and a missing label', () => {
    const [row] = buildRows([job({ deviceName: null, label: undefined })], NOW);

    expect(row).toMatchObject({ printer: 'Impressora padrão', title: 'Um comprovante', failed: false });
  });

  it('has an icon and a label for every kind the queue stores, the test page included', () => {
    const kinds = Object.keys(RECEIPT_KINDS) as Array<PrintJobSummary['kind']>;

    for (const kind of kinds) {
      expect(buildRows([job({ kind })], NOW)[0].kindIcon).toBe(RECEIPT_KINDS[kind].icon);
    }
    expect(RECEIPT_KINDS).toEqual({
      'order-created': { label: 'Produção', icon: 'skillet' },
      'order-dispatched': { label: 'Expedição', icon: 'two_wheeler' },
      board: { label: 'Mesa', icon: 'table_restaurant' },
      'board-billing': { label: 'Conta da mesa', icon: 'receipt' },
      test: { label: 'Teste', icon: 'receipt_long' },
    });
  });
});

describe('hasCountdown', () => {
  it('is true only for a pending job whose instant is still ahead', () => {
    expect(hasCountdown([job({ nextAttemptAt: NOW + 1000 })], NOW)).toBe(true);
    expect(hasCountdown([job({ nextAttemptAt: NOW })], NOW)).toBe(false);
    expect(hasCountdown([job()], NOW)).toBe(false);
    expect(hasCountdown([job({ status: 'failed', nextAttemptAt: NOW + 1000 })], NOW)).toBe(false);
  });
});
