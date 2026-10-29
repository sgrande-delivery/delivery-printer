import React, { useState } from 'react';
import Button from 'renderer/base/Button';
import Chip from 'renderer/base/Chip';
import Icon from 'renderer/base/Icon';
import IconButton from 'renderer/base/IconButton';
import { cx } from 'renderer/base/cx';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { printFailureReason } from 'renderer/helpers/printFailure';
import { cardState, detailLine, stationLabel } from './printerView';
import styles from './PrinterItem.module.css';

interface PrinterItemProps {
  printer: ResolvedPrinter;
  // False when the list of this computer's printers came back empty: then "not found"
  // would be a claim the screen did not measure, so the card stays neutral.
  devicesRead: boolean;
  onEdit(printer: ResolvedPrinter): void;
}

// printer-v2.dc.html:263-274.
const PrinterItem: React.FC<PrinterItemProps> = ({ printer, devicesRead, onEdit }) => {
  // Not in any dependency array: handleOpen changes identity whenever the snackbar opens.
  const { handleOpen } = useMessaging();
  const [testing, setTesting] = useState(false);
  const state = cardState(printer, devicesRead);
  // Without a device there is nothing to test on, but with devicesRead false the screen
  // has not measured it: saying "não encontrada" here would contradict its own notice.
  const noTestReason = devicesRead
    ? 'Esta impressora não foi encontrada nesta máquina'
    : 'As impressoras deste computador não foram lidas';

  // Queued, not printed: the page comes out through the same worker as a receipt, so
  // "enviada" is the honest word, and a failure after the retries shows on the queue screen.
  async function handleTestPrint(): Promise<void> {
    if (!printer.resolvedDevice) {
      return;
    }

    setTesting(true);

    try {
      await window.electron.printTest({
        printerName: printer.name,
        stationLabel: stationLabel(printer.station),
        paperWidth: printer.paper_width,
        deviceName: printer.resolvedDevice,
      });
      handleOpen(`Página de teste enviada para a fila de impressão (${printer.resolvedDevice}).`);
    } catch (err: unknown) {
      log.error('test print failed', err);
      handleOpen(`Não foi possível enviar a página de teste: ${printFailureReason(err)}.`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <li className={cx(styles.item, state === 'missing' && styles.itemMissing)}>
      <span className={styles.icon}>
        <Icon name="print" size={22} />
      </span>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.name}>{printer.name}</span>
          {state === 'found' && (
            <Chip size="compact" tone="ok" iconFirst>
              <Icon name="check" size={14} />
              Encontrada nesta máquina
            </Chip>
          )}
          {state === 'missing' && (
            <Chip size="compact" tone="err" iconFirst>
              <Icon name="warning" size={14} />
              Não encontrada — sai na padrão
            </Chip>
          )}
        </div>
        <div className={styles.detail}>{detailLine(printer)}</div>
      </div>
      <IconButton
        size="small"
        aria-label="Imprimir teste"
        title={printer.resolvedDevice ? 'Imprimir teste' : noTestReason}
        disabled={testing || !printer.resolvedDevice}
        onClick={handleTestPrint}
      >
        <Icon name="receipt_long" size={18} />
      </IconButton>
      <Button size={34} variant={state === 'missing' ? 'contained' : 'outlined'} onClick={() => onEdit(printer)}>
        {state === 'missing' ? 'Corrigir' : 'Editar'}
      </Button>
    </li>
  );
};

export default PrinterItem;
