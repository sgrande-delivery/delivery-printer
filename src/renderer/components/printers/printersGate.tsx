import type { ReactElement } from 'react';
import Spinner from 'renderer/base/Spinner';
import type { PrintersLoadStatus } from 'renderer/hooks/usePrinters';
import PrintersNotice from './PrintersNotice';

/**
 * What a screen that lists the registered printers shows while it cannot yet: a spinner, the no-permission
 * notice (403) or the load failure. null means "ready, draw the screen". A function and not a wrapping
 * component because of that null: the caller needs to be told "do not return, keep drawing", which a
 * component that owns the subtree cannot say back to its parent.
 */
export function printersGate(status: PrintersLoadStatus, onRetry: () => void): ReactElement | null {
  if (status === 'loading') {
    return <Spinner />;
  }

  if (status === 'forbidden') {
    return (
      <PrintersNotice
        title="Sem permissão para ver as impressoras"
        text="O usuário desta sessão não tem permissão para consultar as impressoras cadastradas. Peça ao administrador do restaurante para liberar o acesso."
      />
    );
  }

  if (status === 'error') {
    return (
      <PrintersNotice
        title="Não foi possível carregar as impressoras"
        text="Verifique a internet deste computador e tente novamente."
        onRetry={onRetry}
      />
    );
  }

  return null;
}
