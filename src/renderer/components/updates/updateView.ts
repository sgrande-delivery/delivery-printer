import type { UpdateState } from 'shared/appUpdate';

export type UpdateAction = 'check' | 'download' | 'restart' | 'cancel-restart';
export type UpdateTone = 'ok' | 'accent' | 'warn' | 'err' | 'muted';

export type UpdateCardView = {
  /** The dot color; 'spinner' when it is the ring instead of the dot. */
  dot: UpdateTone | 'spinner';
  text: string;
  button: { label: string; action: UpdateAction; variant: 'contained' | 'outlined'; disabled: boolean } | null;
  progress: { percent: number; doneMb: string; totalMb: string; eta: string | null } | null;
  /** The attention strip of a scheduled restart; null outside it. */
  waiting: string | null;
  lastCheck: string;
};

const MB = 1024 * 1024;

/** One decimal and a decimal comma, as the design writes it (43,7). */
function formatMb(bytes: number): string {
  return (Math.max(0, bytes) / MB).toFixed(1).replace('.', ',');
}

/** null when it cannot be computed: without a rate or a total there is nothing honest to say (fidelity 5). */
function formatEta(state: UpdateState): string | null {
  const { bytesPerSecond, totalBytes, transferredBytes } = state;
  if (!(bytesPerSecond > 0) || !(totalBytes > 0)) {
    return null;
  }
  const seconds = Math.max(1, Math.ceil(Math.max(0, totalBytes - transferredBytes) / bytesPerSecond));
  if (seconds < 60) {
    return `cerca de ${seconds} s`;
  }
  return `cerca de ${Math.ceil(seconds / 60)} min`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLastCheck(lastCheckedAt: number | null, now: number): string {
  if (lastCheckedAt === null) {
    return 'Ainda não houve verificação';
  }
  const at = new Date(lastCheckedAt);
  const today = new Date(now);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const sameDay =
    at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
  // The app stays open for days, and "hoje" on yesterday's check would lie.
  return sameDay
    ? `Última verificação: hoje às ${time}`
    : `Última verificação: ${pad(at.getDate())}/${pad(at.getMonth() + 1)} às ${time}`;
}

function percentOf(state: UpdateState): number {
  return Math.min(100, Math.max(0, Math.round(state.percent)));
}

/** The status table of the spec (atualizacoes.dc.html:365), in one place: the screen and the sidebar read it. */
export function buildUpdateCard(state: UpdateState, now: number): UpdateCardView {
  const target = state.targetVersion;
  const version = target ?? 'nova';
  const base: UpdateCardView = {
    dot: 'ok',
    text: '',
    button: null,
    progress: null,
    waiting: null,
    lastCheck: formatLastCheck(state.lastCheckedAt, now),
  };

  switch (state.status) {
    case 'checking':
      return {
        ...base,
        dot: 'spinner',
        text: 'Procurando atualizações…',
        button: { label: 'Verificando…', action: 'check', variant: 'outlined', disabled: true },
      };
    case 'available':
      return {
        ...base,
        dot: 'accent',
        text: `A versão ${version} está disponível`,
        button: { label: 'Baixar agora', action: 'download', variant: 'contained', disabled: false },
      };
    case 'downloading':
      return {
        ...base,
        dot: 'accent',
        text: `Baixando a versão ${version}`,
        progress: {
          percent: percentOf(state),
          doneMb: formatMb(state.transferredBytes),
          totalMb: formatMb(state.totalBytes),
          eta: formatEta(state),
        },
      };
    case 'ready':
      if (state.restartScheduled) {
        return {
          ...base,
          dot: 'warn',
          text: `A versão ${version} será instalada em seguida`,
          button: { label: 'Cancelar', action: 'cancel-restart', variant: 'outlined', disabled: false },
          waiting: `Reinicia sozinho quando a fila esvaziar · ${state.pendingJobs} na fila`,
        };
      }
      return {
        ...base,
        text: `A versão ${version} está pronta para instalar`,
        button: { label: 'Reiniciar e atualizar', action: 'restart', variant: 'contained', disabled: false },
      };
    case 'restarting':
      return { ...base, dot: 'spinner', text: `Instalando a versão ${version}…` };
    case 'error':
      // A check error has no offered version, and download() is a no-op without one: retry must check.
      return {
        ...base,
        dot: 'err',
        text:
          target === null
            ? 'Não foi possível verificar atualizações. Verifique a internet.'
            : 'Não foi possível baixar. Verifique a internet.',
        button: {
          label: 'Tentar novamente',
          action: target === null ? 'check' : 'download',
          variant: 'outlined',
          disabled: false,
        },
      };
    case 'idle':
    default:
      return {
        ...base,
        text: 'Você está na versão mais recente',
        button: { label: 'Verificar agora', action: 'check', variant: 'outlined', disabled: false },
      };
  }
}

export function releaseNotesTitle(state: UpdateState): string {
  return state.targetVersion !== null && state.targetVersion !== state.currentVersion
    ? `Novidades da versão ${state.targetVersion}`
    : 'Novidades desta versão';
}

export function autoDownloadHint(autoDownload: boolean): string {
  return autoDownload
    ? 'Novas versões são baixadas sem você precisar clicar. Depois é só reiniciar, ou ela é instalada quando o app fechar.'
    : 'O app avisa quando houver versão nova e você clica em Baixar.';
}
