import React, { useState } from 'react';
import { AxiosError } from 'axios';
import Button from 'renderer/base/Button';
import Typography from 'renderer/base/Typography';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { log } from 'renderer/services/log';
import { apiValidationMessage } from 'renderer/services/apiMessage';
import { updatePrinter, type PaperWidth } from 'renderer/services/printers';
import { findPrinterByDeviceName } from 'shared/printerMatch';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import { stations } from './stations';
import styles from './PrinterForm.module.css';

// The API's `copies` rule is min 1, max 3: offering a fourth is a guaranteed 422.
const copiesOptions = [1, 2, 3];
const paperOptions: PaperWidth[] = [58, 80];

function paperOf(event: React.ChangeEvent<HTMLSelectElement>): PaperWidth {
  return event.target.value === '58' ? 58 : 80;
}

interface PrinterFormProps {
  printer: ResolvedPrinter;
  devices: WindowsPrinter[];
  onSaved(): void;
  onCancel(): void;
}

const PrinterForm: React.FC<PrinterFormProps> = ({ printer, devices, onSaved, onCancel }) => {
  // The select holds the device's own spelling. A registered name that matches no device
  // starts empty, so the operator has to pick one instead of re-saving the wrong name.
  const [name, setName] = useState(findPrinterByDeviceName(devices, printer.name)?.name ?? '');
  const [copies, setCopies] = useState(printer.copies);
  const [station, setStation] = useState(printer.station ?? '');
  // Narrowed here instead of asserted at the PUT: the column has a CHECK for (58, 80) and
  // the presenter emits the enum's value, so a stored width is always one of the two.
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(printer.paper_width === 58 ? 58 : 80);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Without a readable device list there is nothing to choose from: the registered name is
  // kept as it is, and the other fields stay editable.
  const canPickName = devices.length > 0;
  const nameToSend = canPickName ? name : printer.name;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await updatePrinter(printer.id, {
        name: nameToSend,
        address: printer.address,
        // Carried through untouched: this screen flips it by the toggle-active route, and a
        // PUT without it turns a deactivated printer back on (see UpdatePrinterPayload).
        activated: printer.activated,
        copies,
        paper_width: paperWidth,
        station: station || null,
      });
      onSaved();
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 403) {
        log.warn('update printer forbidden (403)');
        setError(
          'Sem permissão para alterar as impressoras. Nada foi salvo; peça ao administrador do restaurante para liberar o acesso.'
        );
      } else if (err instanceof AxiosError && err.response?.status === 422) {
        log.warn('update printer rejected (422)');
        setError(apiValidationMessage(err) ?? 'Os dados foram recusados pelo servidor. Nada foi salvo.');
      } else {
        log.error('update printer failed', err);
        setError('Não foi possível salvar. Verifique a internet deste computador e tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.label}>Impressora do Windows</span>
        {canPickName ? (
          <select className={styles.select} value={name} onChange={event => setName(event.target.value)}>
            <option value="" disabled>
              Selecione uma impressora
            </option>
            {devices.map(device => (
              <option key={device.name} value={device.name}>
                {device.name}
              </option>
            ))}
          </select>
        ) : (
          <Typography variant="body2" color="textSecondary">
            {printer.name} (não foi possível ler as impressoras deste computador)
          </Typography>
        )}
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Cópias</span>
        <select className={styles.select} value={copies} onChange={event => setCopies(Number(event.target.value))}>
          {copiesOptions.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Setor</span>
        <select className={styles.select} value={station} onChange={event => setStation(event.target.value)}>
          <option value="">Sem setor</option>
          {Object.entries(stations).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Papel</span>
        <select className={styles.select} value={paperWidth} onChange={event => setPaperWidth(paperOf(event))}>
          {paperOptions.map(option => (
            <option key={option} value={option}>
              {option} mm
            </option>
          ))}
        </select>
      </label>
      {error && (
        <div role="alert">
          <Typography variant="body2" className={styles.error}>
            {error}
          </Typography>
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="contained" type="submit" size="small" disabled={saving || !nameToSend}>
          Salvar
        </Button>
        <Button size="small" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

export default PrinterForm;
