import React, { useEffect, useId, useState } from 'react';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import Spinner from 'renderer/base/Spinner';
import { cx } from 'renderer/base/cx';
import PrintersNotice from 'renderer/components/printers/PrintersNotice';
import { printFailureReason } from 'renderer/helpers/printFailure';
import { clock } from 'renderer/helpers/text';
import { useNow } from 'renderer/hooks/useNow';
import { usePrinters } from 'renderer/hooks/usePrinters';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import packageJson from '../../../../package.json';
import {
  buildPreview,
  buttonLabel,
  paperPixels,
  selectedPrinter,
  statusMessage,
  toRequest,
  type MessageTone,
  type TestStatus,
} from './testPrintView';
import PrinterOptionList from './PrinterOptionList';
import styles from './TestPrint.module.css';

const TONE_CLASS: Record<MessageTone, string> = {
  muted: styles.messageMuted,
  working: styles.messageWorking,
  ok: styles.messageOk,
  err: styles.messageErr,
};

function sentAt(): string {
  return clock(Date.now());
}

// printer-v2.dc.html:345-385. The page is built in the main process (testPrintPage.ts) and goes through
// the queue like a receipt; this screen picks the registration, shows what will come out and says it left.
const TestPrint: React.FC = () => {
  const { status, printers, devicesRead, reload, revalidate } = usePrinters();
  const { handleOpen } = useMessaging();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<TestStatus>({ phase: 'idle' });
  const labelId = useId();
  // The date line of the preview is what the paper will say: it follows the clock, not the last click.
  const now = useNow(() => true, 10_000);

  // The list is shared with the sidebar and was loaded when the shell opened: opening this screen reads it
  // again, because the operator may have changed Windows since (the test is made for exactly that).
  useEffect(() => {
    revalidate();
  }, [revalidate]);

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
        onRetry={reload}
      />
    );
  }

  const selected = selectedPrinter(printers, selectedId);

  if (!selected) {
    return <p className={styles.empty}>Nenhuma impressora cadastrada para este restaurante.</p>;
  }

  // Not an alias to delete: handlePrint is a hoisted declaration and does not inherit the narrowing of
  // `selected`; without this const, toRequest(selected) fails with TS2345.
  const printer = selected;
  const message = statusMessage(result, printer.name);
  const preview = buildPreview(printer, packageJson.version, new Date(now));

  function handlePick(id: number): void {
    // The previous answer was about another printer.
    setSelectedId(id);
    setResult({ phase: 'idle' });
  }

  async function handlePrint(): Promise<void> {
    setResult({ phase: 'sending' });

    try {
      await window.electron.printTest(toRequest(printer));
      setResult({ phase: 'done', at: sentAt() });
    } catch (err: unknown) {
      const reason = printFailureReason(err);

      log.error('test print failed', err);
      setResult({ phase: 'failed', reason });
      handleOpen(`Não foi possível enviar a página de teste: ${reason}.`);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.column}>
        <div className={styles.intro}>
          Imprime uma página gerada aqui mesmo, sem depender do servidor. Use na instalação ou para conferir se a
          impressora certa responde.
        </div>
        <div id={labelId} className={styles.label}>
          Impressora
        </div>
        <PrinterOptionList
          labelId={labelId}
          printers={printers}
          selectedId={printer.id}
          devicesRead={devicesRead}
          disabled={result.phase === 'sending'}
          onPick={handlePick}
        />
        <div className={styles.actionRow}>
          <Button variant="contained" size={44} disabled={result.phase === 'sending'} onClick={handlePrint}>
            <Icon name="print" size={20} />
            {buttonLabel(result)}
          </Button>
          <span
            className={cx(styles.message, TONE_CLASS[message.tone])}
            role={message.tone === 'err' ? 'alert' : 'status'}
          >
            {message.icon && (
              <Icon
                name={message.icon}
                size={18}
                className={message.icon === 'progress_activity' ? 'spin' : undefined}
              />
            )}
            {message.text}
          </span>
        </div>
      </div>
      <div className={styles.previewColumn}>
        <div className={styles.label}>Página de teste</div>
        <div className={styles.previewBackdrop}>
          <div className={styles.paper} style={{ width: paperPixels(preview.paperWidth) }}>
            <div className={styles.frame}>
              <div className={styles.paperTitle}>{preview.title}</div>
              {preview.lines.map(line => (
                <div key={line} className={styles.paperLine}>
                  {line}
                </div>
              ))}
              {preview.rulers.map(ruler => (
                <div key={ruler} className={styles.ruler}>
                  {ruler}
                </div>
              ))}
              <div className={styles.paperLine}>{preview.note}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestPrint;
