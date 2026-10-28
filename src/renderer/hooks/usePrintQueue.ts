import { useCallback, useEffect, useRef, useState } from 'react';
import { log } from 'renderer/services/log';
import type { PrintJobSummary } from 'shared/printQueue';

interface PrintQueueState {
  pending: PrintJobSummary[];
  failed: PrintJobSummary[];
  // Whatever the queue still keeps as printed: at most 200 jobs and 24 h of them (RN-08).
  printed: PrintJobSummary[];
  retry(id?: string): Promise<void>;
}

export function usePrintQueue(): PrintQueueState {
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  // Resposta antiga que chega depois de uma nova não pode desfazer o estado mais recente.
  const requestRef = useRef(0);

  const refresh = useCallback((): void => {
    const request = ++requestRef.current;

    window.electron
      .queueState()
      .then(state => {
        if (request === requestRef.current) {
          setJobs(state);
        }
      })
      .catch((err: unknown) => log.error('queue state failed', err));
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

  return {
    pending: jobs.filter(job => job.status === 'pending'),
    failed: jobs.filter(job => job.status === 'failed'),
    printed: jobs.filter(job => job.status === 'printed'),
    retry,
  };
}
