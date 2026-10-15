// The reason is the `failureReason` of webContents.print's callback. These are the
// three values Electron 43 produces — documented in electron.d.ts:18486 and present
// as literals in the shipped binary. Lowercase keys because the lookup is too.
const REASONS: Record<string, string> = {
  'print job failed': 'a impressora não respondeu (verifique se está ligada, com papel e conectada)',
  'print job canceled': 'a impressão foi cancelada',
  'invalid printer settings': 'as configurações de impressão foram recusadas (verifique a impressora)',
};

// ipcRenderer.invoke wraps the main-process rejection as
// "Error invoking remote method 'rawPrint': <reason>"; the reason is what matters.
const INVOKE_PREFIX = /^(?:Error:\s*)?Error invoking remote method '[^']*':\s*(?:Error:\s*)?/;

export const SERVER_FETCH_REASON = 'não foi possível obter o comprovante do servidor';

function rawMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  // The main process rejects rawPrint with the Electron reason, a plain string.
  return typeof err === 'string' ? err : '';
}

export function printFailureReason(err: unknown): string {
  const reason = rawMessage(err).replace(INVOKE_PREFIX, '').trim();

  if (!reason) {
    return 'motivo desconhecido';
  }

  // Unmapped reasons are shown as they came instead of being swallowed.
  return REASONS[reason.toLowerCase()] ?? reason;
}

export type PrintFailureNotice = { title: string; body: string };

export function buildPrintFailureNotice(subject: string, printer: string | null, reason: string): PrintFailureNotice {
  const where = printer ? ` na impressora "${printer}"` : '';

  return { title: 'Falha ao imprimir', body: `Não foi possível imprimir ${subject}${where}: ${reason}.` };
}
