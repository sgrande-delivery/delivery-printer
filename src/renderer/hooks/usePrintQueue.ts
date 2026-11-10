import { useMemo } from 'react';
import { log } from 'renderer/services/log';
import type { PrintJobSummary } from 'shared/printQueue';
import { createSharedStore, useSharedStore } from './sharedStore';

interface PrintQueueState {
  pending: PrintJobSummary[];
  failed: PrintJobSummary[];
  // Whatever the queue still keeps as printed: at most 200 jobs and 24 h of them (RN-08).
  printed: PrintJobSummary[];
  // False until the first answer of the main process: an empty list is only "nothing" once this is true.
  loaded: boolean;
  retry(id?: string): Promise<void>;
  discard(id: string): Promise<boolean>;
  // Same id, back to the printer, no request to the API. False when the main refused (gone, pending, or no HTML left).
  reprint(id: string): Promise<boolean>;
}

interface QueueSnapshot {
  jobs: PrintJobSummary[];
  loaded: boolean;
}

// Resposta antiga que chega depois de uma nova não pode desfazer o estado mais recente.
let request = 0;

// One copy for the whole shell: the sidebar badge and the open screen read the same list, and the main
// answers one `queueState` per announcement instead of one per mounted reader.
const store = createSharedStore<QueueSnapshot>({ jobs: [], loaded: false }, () => {
  // Assina antes de ler: mudança que aconteça entre a leitura e a assinatura seria perdida.
  const offChanged = window.electron.onQueueChanged(refresh);

  refresh();

  return () => {
    offChanged();
    // Invalida resposta em voo: não setar estado depois do desmonte.
    request++;
  };
});

function refresh(): void {
  const mine = ++request;

  window.electron
    .queueState()
    .then(state => {
      if (mine === request) {
        store.set({ jobs: state, loaded: true });
      }
    })
    .catch((err: unknown) => {
      log.error('queue state failed', err);

      // Still "loaded": a screen waiting on a request that failed would spin forever, which is
      // the silent failure this app hunts. The empty state is honest; the log carries the cause.
      if (mine === request) {
        store.set({ jobs: store.get().jobs, loaded: true });
      }
    });
}

async function retry(id?: string): Promise<void> {
  try {
    await window.electron.retryFailed(id);
  } catch (err) {
    log.error('retry failed jobs failed', err, { id });
  }

  // O main anuncia a mudança, mas só quando houve mudança: o clique que não achou
  // nada para reprocessar também tem de atualizar o que a tela mostra.
  refresh();
}

async function discard(id: string): Promise<boolean> {
  let discarded = false;

  try {
    discarded = await window.electron.discardJob(id);
  } catch (err) {
    log.error('discard failed job failed', err, { id });
  }

  // Same reason as the retry: the main only announces when it removed something.
  refresh();

  return discarded;
}

async function reprint(id: string): Promise<boolean> {
  let accepted = false;

  try {
    accepted = await window.electron.reprintJob(id);
  } catch (err) {
    log.error('reprint job failed', err, { id });
  }

  refresh();

  return accepted;
}

export function usePrintQueue(): PrintQueueState {
  const { jobs, loaded } = useSharedStore(store);

  return useMemo(
    () => ({
      loaded,
      reprint,
      pending: jobs.filter(job => job.status === 'pending'),
      failed: jobs.filter(job => job.status === 'failed'),
      printed: jobs.filter(job => job.status === 'printed'),
      retry,
      discard,
    }),
    [jobs, loaded]
  );
}
