import { RECEIPT_KINDS } from 'renderer/helpers/receiptKind';
import { capitalize, clock } from 'renderer/helpers/text';
import { startOfDay } from 'renderer/hooks/useDashboardHealth';
import type { IconName } from 'renderer/base/Icon';
import type { PrintJobKind, PrintJobSummary } from 'shared/printQueue';
import { KEEP_PRINTED_HTML } from 'shared/queueLimits';

export type HistoryFilter = 'all' | PrintJobKind | 'failed';

// printer-v2.dc.html:659, plus Teste (the queue has that kind and the mock did not), before Falhas.
export const HISTORY_FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'order-created', label: RECEIPT_KINDS['order-created'].label },
  { id: 'order-dispatched', label: RECEIPT_KINDS['order-dispatched'].label },
  { id: 'board', label: RECEIPT_KINDS.board.label },
  { id: 'board-billing', label: RECEIPT_KINDS['board-billing'].label },
  { id: 'test', label: RECEIPT_KINDS.test.label },
  { id: 'failed', label: 'Falhas' },
];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// What the history lists: jobs that came out or failed since the local midnight (RN-08), newest first
// (printer-v2.dc.html:666). A pending job is in the queue screen, not here.
export function todaysJobs(jobs: PrintJobSummary[], now: Date): PrintJobSummary[] {
  const midnight = startOfDay(now);

  return jobs
    .filter(job => (job.status === 'printed' || job.status === 'failed') && job.createdAt >= midnight)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Search by the label ("o pedido #42", "a mesa 5") without case, as printer-v2.dc.html:664.
export function filterJobs(jobs: PrintJobSummary[], filter: HistoryFilter, search: string): PrintJobSummary[] {
  const query = search.trim().toLowerCase();

  return jobs.filter(job => {
    const byFilter = filter === 'all' || (filter === 'failed' ? job.status === 'failed' : job.kind === filter);

    return byFilter && (query === '' || (job.label ?? '').toLowerCase().includes(query));
  });
}

// Counts the whole day, not what the chip and the search left on screen.
export function summaryText(jobs: PrintJobSummary[], now: Date): string {
  const failed = jobs.filter(job => job.status === 'failed').length;
  const printed = jobs.length - failed;
  const parts = [
    `Hoje, ${now.getDate()} ${MONTHS[now.getMonth()]}`,
    printed === 1 ? '1 impresso' : `${printed} impressos`,
  ];

  if (failed > 0) {
    parts.push(failed === 1 ? '1 falha' : `${failed} falhas`);
  }

  return parts.join(' · ');
}

export function emptyText(filtering: boolean, hasToday: boolean): string {
  if (filtering && hasToday) {
    return 'Nenhum comprovante com esse filtro.';
  }

  return 'Nada foi impresso hoje.';
}

export function unavailableReprintHint(keep: number = KEEP_PRINTED_HTML): string {
  return `Só os ${keep} comprovantes mais recentes podem ser reimpressos.`;
}

export function reprintMessage(title: string, printer: string, accepted: boolean): string {
  return accepted
    ? `${title} enviado para ${printer}.`
    : `${title} não pôde ser reimpresso. Confira a lista e tente de novo.`;
}

export interface HistoryRow {
  id: string;
  time: string;
  title: string;
  kindIcon: IconName;
  kindLabel: string;
  printer: string;
  copies: string;
  failed: boolean;
  situation: string;
  reprintable: boolean;
}

export function buildHistoryRows(jobs: PrintJobSummary[]): HistoryRow[] {
  return jobs.map(job => {
    const kind = RECEIPT_KINDS[job.kind];

    return {
      id: job.id,
      time: clock(job.createdAt),
      title: capitalize(job.label ?? 'um comprovante'),
      kindIcon: kind.icon,
      kindLabel: kind.label,
      printer: job.deviceName ?? 'Impressora padrão',
      copies: `${job.copies}×`,
      failed: job.status === 'failed',
      situation: job.status === 'failed' ? 'Falhou' : 'Impresso',
      reprintable: job.reprintable,
    };
  });
}
