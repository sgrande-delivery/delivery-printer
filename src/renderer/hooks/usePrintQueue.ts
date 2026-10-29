import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from 'renderer/services/log';
import type { PrintJobSummary } from 'shared/printQueue';

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

export function usePrintQueue(): PrintQueueState {
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Resposta antiga que chega depois de uma nova não pode desfazer o estado mais recente.
  const requestRef = useRef(0);

  const refresh = useCallback((): void => {
    const request = ++requestRef.current;

    window.electron
      .queueState()
      .then(state => {
        if (request === requestRef.current) {
          setJobs(state);
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        log.error('queue state failed', err);

        // Still "loaded": a screen waiting on a request that failed would spin forever, which is
        // the silent failure this app hunts. The empty state is honest; the log carries the cause.
        if (request === requestRef.current) {
          setLoaded(true);
        }
      });
  }, []);

  useEffect(() => {
    const request = requestRef;

    // Assina antes de ler: mudança que aconteça entre a leitura e a assinatura seria perdida.
    const offChanged = window.electron.onQueueChanged(refresh);

    refresh();

    return () => {
      offChanged();
      // Invalida resposta em voo: não setar estado depois do desmonte.
      request.current++;
    };
  }, [refresh]);

  const retry = useCallback(
    async (id?: string): Promise<void> => {
      try {
        await window.electron.retryFailed(id);
      } catch (err) {
        log.error('retry failed jobs failed', err, { id });
      }

      // O main anuncia a mudança, mas só quando houve mudança: o clique que não achou
      // nada para reprocessar também tem de atualizar o que a tela mostra.
      refresh();
    },
    [refresh]
  );

  const discard = useCallback(
    async (id: string): Promise<boolean> => {
      let discarded = false;

      try {
        discarded = await window.electron.discardJob(id);
      } catch (err) {
        log.error('discard failed job failed', err, { id });
      }

      // Same reason as the retry: the main only announces when it removed something.
      refresh();

      return discarded;
    },
    [refresh]
  );

  const reprint = useCallback(
    async (id: string): Promise<boolean> => {
      let accepted = false;

      try {
        accepted = await window.electron.reprintJob(id);
      } catch (err) {
        log.error('reprint job failed', err, { id });
      }

      refresh();

      return accepted;
    },
    [refresh]
  );

  return {
    loaded,
    reprint,
    pending: jobs.filter(job => job.status === 'pending'),
    failed: jobs.filter(job => job.status === 'failed'),
    printed: jobs.filter(job => job.status === 'printed'),
    retry,
    discard,
  };
}
