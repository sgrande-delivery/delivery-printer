import React, { useEffect, useRef } from 'react';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import { confirmLabel, queueText } from './restartText';
import styles from './RestartDialog.module.css';

interface RestartDialogProps {
  version: string;
  pendingJobs: number;
  onCancel(): void;
  onConfirm(): void;
}

const FOCUSABLE = 'button:not(:disabled), [tabindex]:not([tabindex="-1"])';

// atualizacoes.dc.html:201-221. The first modal of the app, so it lives here and not in base/: a primitive
// is born when the pattern shows up in two places. The veil and the panel follow the printers drawer.
const RestartDialog: React.FC<RestartDialogProps> = ({ version, pendingJobs, onCancel, onConfirm }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel takes the focus on open and gives it back to the button that opened it -- the banner, the
  // sidebar card or the screen's card -- on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    panelRef.current?.focus();

    return () => {
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // A modal keeps Tab inside it; without this the focus walks into the screen behind the veil.
  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab' || !panelRef.current) {
      return;
    }

    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));

    if (items.length === 0) {
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.veil} onClick={onCancel} aria-hidden />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restart-dialog-title"
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
      >
        <div className={styles.head}>
          <span className={styles.badge}>
            <Icon name="restart_alt" size={22} />
          </span>
          <h2 id="restart-dialog-title" className={styles.title}>
            Reiniciar para atualizar?
          </h2>
        </div>
        <p className={styles.text}>
          O Delivery Printer fecha e abre de novo na versão {version}. A impressão fica pausada por alguns segundos.
        </p>
        {pendingJobs > 0 && (
          <div className={styles.queue}>
            <Icon name="stacks" size={18} />
            <span>{queueText(pendingJobs)}</span>
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="outlined" size={38} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="contained" size={38} onClick={onConfirm}>
            {confirmLabel(pendingJobs)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RestartDialog;
