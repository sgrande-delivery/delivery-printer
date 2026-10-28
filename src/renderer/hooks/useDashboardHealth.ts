import { printFailureReason } from 'renderer/helpers/printFailure';
import { capitalize, clock } from 'renderer/helpers/text';
import { RECEIPT_KINDS } from 'renderer/helpers/receiptKind';
import { stations } from 'renderer/components/printers/stations';
import { usePrintQueue } from 'renderer/hooks/usePrintQueue';
import { usePrinters } from 'renderer/hooks/usePrinters';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import type { IconName } from 'renderer/base/Icon';
import type { PrintJobSummary } from 'shared/printQueue';

export type HealthTone = 'ok' | 'warn' | 'err';

export interface DashboardHealth {
  tone: HealthTone;
  icon: IconName;
  title: string;
  subtitle: string;
  action: { label: string; to: string } | null;
}

export interface DashboardStats {
  printedToday: number;
  pending: number;
  failed: number;
}

export interface DashboardChip {
  id: number;
  label: string;
  // `null` is "not measured": the devices of this machine could not be read.
  // The dot the Chip takes: 'muted' when this machine's devices could not be read, so nothing
  // is accused of what was not measured.
  dot: 'ok' | 'err' | 'muted';
}

export interface DashboardView {
  health: DashboardHealth;
  stats: DashboardStats;
  chips: DashboardChip[];
}

interface DashboardInput {
  pending: PrintJobSummary[];
  failed: PrintJobSummary[];
  printed: PrintJobSummary[];
  printers: ResolvedPrinter[];
  devicesRead: boolean;
  now: Date;
}

// "Hoje" is since the local midnight, not the last 24 h: the label says "hoje".
export function startOfDay(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  return midnight.getTime();
}

// The precedence is the rule, not a style choice (printer-v2.dc.html:613-616): a failure wins over
// a printer not found, which wins over the normal state.
export function buildDashboard({
  pending,
  failed,
  printed,
  printers,
  devicesRead,
  now,
}: DashboardInput): DashboardView {
  const today = printed.filter(job => job.createdAt >= startOfDay(now));
  // Without a read of this machine's devices nobody is accused (same rule as the sidebar badge).
  const missing = devicesRead ? printers.filter(printer => !printer.resolvedDevice).length : 0;
  let health: DashboardHealth;

  if (failed.length > 0) {
    const first = failed[0];
    const what = capitalize(first.label ?? 'um comprovante');

    health = {
      tone: 'err',
      icon: 'error',
      title: failed.length === 1 ? '1 impressão falhou' : `${failed.length} impressões falharam`,
      subtitle: `${what} não saiu: ${printFailureReason(first.lastError ?? '')}.`,
      action: { label: 'Ver fila', to: '/queue' },
    };
  } else if (missing > 0) {
    health = {
      tone: 'warn',
      icon: 'warning',
      title: missing === 1 ? '1 impressora não encontrada' : `${missing} impressoras não encontradas`,
      subtitle: `Os comprovantes ${missing === 1 ? 'dela vão' : 'delas vão'} para a impressora padrão do Windows.`,
      action: { label: 'Corrigir', to: '/printers' },
    };
  } else {
    // The design always has a history; a PDV at 8 a.m. does not.
    const last = today.reduce<PrintJobSummary | null>((a, b) => (a && a.createdAt >= b.createdAt ? a : b), null);

    health = {
      tone: 'ok',
      icon: 'check_circle',
      title: 'Imprimindo automaticamente',
      subtitle: last
        ? `Último comprovante: ${capitalize(last.label ?? 'um comprovante')} · ${RECEIPT_KINDS[last.kind].label} às ${clock(last.createdAt)}`
        : 'Pronto e aguardando pedidos.',
      action: null,
    };
  }

  return {
    health,
    stats: { printedToday: today.length, pending: pending.length, failed: failed.length },
    chips: printers.map(printer => ({
      id: printer.id,
      label: `${printer.station ? (stations[printer.station] ?? printer.station) : 'Sem setor'} · ${printer.name}`,
      dot: devicesRead ? (printer.resolvedDevice ? 'ok' : 'err') : 'muted',
    })),
  };
}

export function useDashboardHealth(): DashboardView {
  const { pending, failed, printed } = usePrintQueue();
  const { printers, devicesRead } = usePrinters();

  // Computed on each render: `now` is what moves "hoje", and the inputs are fresh arrays anyway.
  return buildDashboard({ pending, failed, printed, printers, devicesRead, now: new Date() });
}
