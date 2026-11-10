import { printFailureReason } from 'renderer/helpers/printFailure';
import { RECEIPT_KINDS } from 'renderer/helpers/receiptKind';
import { capitalize, clock } from 'renderer/helpers/text';
import { isQueueTab } from 'renderer/types/queueTab';
import type { QueueTab } from 'renderer/types/queueTab';
import type { IconName } from 'renderer/base/Icon';
import type { PrintJobSummary } from 'shared/printQueue';
import { MAX_AGE_MS, MAX_ATTEMPTS } from 'shared/queueLimits';

const HOUR_MS = 60 * 60 * 1000;

// The tab the screen shows until the operator picks one (printer-v2.dc.html:649): what the navigate state
// asked for, else Falhados when something failed, else Pendentes.
export function resolveTab(picked: QueueTab | null, fromNavigation: unknown, failedCount: number): QueueTab {
  if (picked) {
    return picked;
  }

  if (isQueueTab(fromNavigation)) {
    return fromNavigation;
  }

  return failedCount > 0 ? 'failed' : 'pending';
}

export function failedHeadline(count: number): string {
  return count === 1 ? '1 comprovante não saiu' : `${count} comprovantes não saíram`;
}

// Both numbers come from the limits the worker and the store enforce.
export function limitHint(maxAttempts: number = MAX_ATTEMPTS, maxAgeMs: number = MAX_AGE_MS): string {
  const hours = Math.round(maxAgeMs / HOUR_MS);

  return `Cada trabalho tenta até ${maxAttempts} vezes. Comprovantes com mais de ${hours} h são descartados.`;
}

export function emptyText(tab: QueueTab): string {
  return tab === 'failed' ? 'Nenhuma impressão falhou.' : 'Nada esperando para imprimir.';
}

export interface Situation {
  icon: IconName;
  text: string;
  tone: 'err' | 'muted';
}

// A pending job that failed once waits for its backoff: the main process sends the instant, and a
// second is never invented here. Without the instant (the wait lives in memory and a restart loses it)
// the text says what is known and has no count.
export function situationOf(job: PrintJobSummary, now: number): Situation {
  if (job.status === 'failed') {
    return { icon: 'error', text: capitalize(printFailureReason(job.lastError ?? '')), tone: 'err' };
  }

  if (job.nextAttemptAt !== undefined) {
    const seconds = Math.ceil((job.nextAttemptAt - now) / 1000);

    if (seconds > 0) {
      return { icon: 'schedule', text: `Nova tentativa em ${seconds} s`, tone: 'muted' };
    }

    return { icon: 'print', text: 'Imprimindo…', tone: 'muted' };
  }

  if (job.attempts > 0) {
    return { icon: 'schedule', text: 'Aguardando nova tentativa', tone: 'muted' };
  }

  return { icon: 'print', text: 'Imprimindo…', tone: 'muted' };
}

export interface QueueRow {
  id: string;
  failed: boolean;
  kindIcon: IconName;
  title: string;
  subtitle: string;
  printer: string;
  attempts: string;
  situation: Situation;
}

export function buildRows(jobs: PrintJobSummary[], now: number): QueueRow[] {
  return jobs.map(job => {
    const kind = RECEIPT_KINDS[job.kind];

    return {
      id: job.id,
      failed: job.status === 'failed',
      kindIcon: kind.icon,
      title: capitalize(job.label ?? 'um comprovante'),
      subtitle: `${kind.label} · ${clock(job.createdAt)}`,
      printer: job.deviceName ?? 'Impressora padrão',
      attempts: `${job.attempts}/${MAX_ATTEMPTS}`,
      situation: situationOf(job, now),
    };
  });
}

// Whether any row is counting down: the screen only ticks a clock while this is true.
export function hasCountdown(jobs: PrintJobSummary[], now: number): boolean {
  return jobs.some(job => job.status === 'pending' && job.nextAttemptAt !== undefined && job.nextAttemptAt > now);
}

export function discardMessage(title: string, discarded: boolean): string {
  return discarded ? `${title} descartado.` : `${title} não foi descartado. Confira a lista e tente de novo.`;
}

export function retryMessage(title: string): string {
  return `${title} voltou para a fila.`;
}
