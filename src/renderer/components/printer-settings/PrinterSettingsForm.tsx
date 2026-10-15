import React, { useState } from 'react';
import { AxiosError } from 'axios';
import Button from 'renderer/base/Button';
import Select from 'renderer/base/Select';
import Typography from 'renderer/base/Typography';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { apiValidationMessage } from 'renderer/services/apiMessage';
import {
  UntrustedBaselineError,
  updatePrinterSettings,
  type PrinterSettingsData,
} from 'renderer/services/printerSettings';
import type { PrinterSetting } from 'renderer/types/restaurant';
import styles from './PrinterSettingsForm.module.css';

type NumberKey = 'font_size' | 'production_template_copies' | 'shipment_template_copies' | 'margin_size';

interface NumberField {
  key: NumberKey;
  label: string;
  options: { value: number; label: string }[];
}

function range(values: number[], suffix = ''): NumberField['options'] {
  return values.map(value => ({ value, label: `${value}${suffix}` }));
}

// Same labels and closed sets as the admin panel (PrinterSettingsForm there), so both screens
// are the same configuration to the operator. The sets also keep out values that ruin the
// print: font-size 0 is a blank receipt, 0 copies is no receipt. The server validates nothing.
const numberFields: NumberField[] = [
  { key: 'font_size', label: 'Tamanho da fonte', options: range([12, 14, 16, 18, 20, 22, 24]) },
  { key: 'production_template_copies', label: 'Cópias impressão produção', options: range([1, 2, 3, 4]) },
  { key: 'shipment_template_copies', label: 'Cópias impressão entrega', options: range([1, 2, 3, 4]) },
  {
    key: 'margin_size',
    label: 'Tamanho das margens',
    // The panel's "0px" is the value 1.
    options: [{ value: 1, label: '0px' }, ...range([10, 15, 20, 25, 30, 35, 40], 'px')],
  },
];

function initialText(settings: PrinterSettingsData, key: NumberKey): string {
  const value = settings[key];

  return typeof value === 'number' ? String(value) : '';
}

interface PrinterSettingsFormProps {
  settings: PrinterSettingsData;
  // Receives the full payload that was sent, to become the new baseline.
  onSaved(settings: PrinterSettingsData): void;
}

const PrinterSettingsForm: React.FC<PrinterSettingsFormProps> = ({ settings, onSaved }) => {
  const { handleOpen } = useMessaging();
  const [texts, setTexts] = useState<Record<NumberKey, string>>({
    font_size: initialText(settings, 'font_size'),
    production_template_copies: initialText(settings, 'production_template_copies'),
    shipment_template_copies: initialText(settings, 'shipment_template_copies'),
    margin_size: initialText(settings, 'margin_size'),
  });
  const [noMargin, setNoMargin] = useState(settings.no_margin === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only what the operator changed goes in `changes`; the rest of the payload is the loaded
  // object itself (see updatePrinterSettings). A key the API did not return and the operator
  // did not fill stays absent, instead of being created with an invented value.
  const changes: Partial<PrinterSetting> = {};

  for (const { key } of numberFields) {
    const text = texts[key].trim();

    if (text === initialText(settings, key)) {
      continue;
    }

    // The select only offers numbers; '' is the untouched "not set" option.
    if (text !== '') {
      changes[key] = Number(text);
    }
  }

  if (noMargin !== (settings.no_margin === true)) {
    changes.no_margin = noMargin;
  }

  const dirty = Object.keys(changes).length > 0;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const saved = await updatePrinterSettings(settings, changes);

      onSaved(saved);
      handleOpen('Configurações de impressão salvas.');
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response?.status === 403) {
        log.warn('update printer settings forbidden (403)');
        setError(
          'Sem permissão para alterar as configurações de impressão. Nada foi salvo; peça ao administrador do restaurante para liberar o acesso.'
        );
      } else if (err instanceof AxiosError && err.response?.status === 422) {
        // Defensive: this endpoint validates nothing today, so a 422 is not observed behaviour.
        log.warn('update printer settings rejected (422)');
        setError(apiValidationMessage(err) ?? 'Os dados foram recusados pelo servidor. Nada foi salvo.');
      } else if (err instanceof UntrustedBaselineError) {
        log.error('update printer settings refused: untrusted baseline', err);
        setError('As configurações atuais não foram lidas por completo. Nada foi salvo.');
      } else {
        log.error('update printer settings failed', err);
        setError('Não foi possível salvar. Verifique a internet deste computador e tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  const version = typeof settings.delivery_printer_version === 'string' ? settings.delivery_printer_version : '';

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {numberFields.map(({ key, label, options }) => {
        const current = initialText(settings, key);
        // A stored value outside the closed set stays selectable, so opening the screen never
        // silently changes it.
        const known = current === '' || options.some(option => String(option.value) === current);

        return (
          <Select
            key={key}
            label={label}
            fullWidth
            value={texts[key]}
            onChange={event => setTexts(currentTexts => ({ ...currentTexts, [key]: event.target.value }))}
          >
            {current === '' && <option value="">Não definido</option>}
            {!known && <option value={current}>{current}</option>}
            {options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        );
      })}
      <label className={styles.check}>
        <input type="checkbox" checked={noMargin} onChange={event => setNoMargin(event.target.checked)} />
        <span>Remover margens</span>
      </label>
      <div className={styles.readOnly}>
        <Typography variant="caption" color="textSecondary">
          Versão do instalador oferecida no painel
        </Typography>
        <Typography variant="body1">{version || 'não definida'}</Typography>
      </div>
      {error && (
        <div role="alert">
          <Typography variant="body2" className={styles.error}>
            {error}
          </Typography>
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="contained" type="submit" size="small" disabled={saving || !dirty}>
          Salvar
        </Button>
      </div>
    </form>
  );
};

export default PrinterSettingsForm;
