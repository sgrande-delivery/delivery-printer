import React, { useState } from 'react';
import Typography from 'renderer/base/Typography';
import Button from 'renderer/base/Button';
import { cx } from 'renderer/base/cx';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { AxiosError } from 'axios';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { togglePrinterActive } from 'renderer/services/printers';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import PrinterForm from './PrinterForm';
import { stations } from './stations';
import styles from './PrinterItem.module.css';

interface PrinterItemProps {
  printer: ResolvedPrinter;
  // False when the list of this computer's printers came back empty: then "not found"
  // would be a claim the screen did not measure, so the item says nothing about it.
  devices: WindowsPrinter[];
  devicesRead: boolean;
  // Called after a change reached the API, so the list is read again.
  onChanged(): void;
}

const PrinterItem: React.FC<PrinterItemProps> = ({ printer, devices, devicesRead, onChanged }) => {
  // Not in any dependency array: handleOpen changes identity whenever the snackbar opens.
  const { handleOpen } = useMessaging();
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const missing = devicesRead && !printer.resolvedDevice;

  async function handleToggle(): Promise<void> {
    setToggleError(null);
    // The route flips the column, so it is not idempotent: a second click while the first
    // is in flight lands back on the original state and looks like nothing happened.
    setToggling(true);

    try {
      await togglePrinterActive(printer.id);
      handleOpen(printer.activated ? 'Impressora desativada.' : 'Impressora ativada.');
      onChanged();
    } catch (err: unknown) {
      log.error('toggle printer failed', err);
      setToggleError(
        err instanceof AxiosError && err.response?.status === 403
          ? 'Sem permissão para alterar as impressoras. Nada foi salvo.'
          : 'Não foi possível alterar a impressora. Tente novamente.'
      );
    } finally {
      setToggling(false);
    }
  }

  return (
    <li className={cx(styles.item, missing && styles.itemMissing)}>
      <div className={styles.itemHeader}>
        <Typography variant="body1">{printer.name}</Typography>
        <Typography variant="caption" color="textSecondary">
          {printer.activated ? 'ativa' : 'inativa'}
        </Typography>
      </div>
      <Typography variant="body2" color="textSecondary">
        {printer.station ? (stations[printer.station] ?? printer.station) : 'Sem setor'} · {printer.copies}{' '}
        {printer.copies === 1 ? 'cópia' : 'cópias'} · papel de {printer.paper_width} mm
      </Typography>
      {devicesRead && printer.resolvedDevice && (
        <Typography variant="body2" className={styles.found}>
          encontrada
        </Typography>
      )}
      {missing && (
        <div role="alert">
          <Typography variant="body2" className={styles.missing}>
            não encontrada nesta máquina
          </Typography>
          <Typography variant="body2" color="textSecondary">
            a impressão está saindo na impressora padrão do Windows
          </Typography>
        </div>
      )}
      {toggleError && (
        <div role="alert">
          <Typography variant="body2" className={styles.error}>
            {toggleError}
          </Typography>
        </div>
      )}
      {editing ? (
        <PrinterForm
          printer={printer}
          devices={devices}
          onSaved={() => {
            setEditing(false);
            handleOpen('Impressora atualizada.');
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className={styles.actions}>
          <Button size="small" onClick={() => setEditing(true)} disabled={toggling}>
            Editar
          </Button>
          <Button size="small" onClick={handleToggle} disabled={toggling}>
            {printer.activated ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      )}
    </li>
  );
};

export default PrinterItem;
