import React, { useState } from 'react';
import { AxiosError } from 'axios';
import Button from 'renderer/base/Button';
import Stepper from 'renderer/base/Stepper';
import Switch from 'renderer/base/Switch';
import { useAuth } from 'renderer/providers/auth';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { apiValidationMessage } from 'renderer/services/apiMessage';
import {
  UntrustedBaselineError,
  fetchPrinterSettings,
  updatePrinterSettings,
  type PrinterSettingsData,
} from 'renderer/services/printerSettings';
import {
  currentNoMargin,
  currentValue,
  diffChanges,
  isDirty,
  marginHint,
  previewMetrics,
  readNumber,
  stepOptions,
  type Draft,
  type StepKey,
} from './printerSettingsModel';
import SettingsRow from './SettingsRow';
import styles from './PrinterSettingsForm.module.css';

interface PrinterSettingsFormProps {
  settings: PrinterSettingsData;
  // Receives the full payload that was sent, to become the new baseline.
  onSaved(settings: PrinterSettingsData): void;
  // The rest of the left column (the local appearance section), below the note.
  children?: React.ReactNode;
}

const PrinterSettingsForm: React.FC<PrinterSettingsFormProps> = ({ settings, onSaved, children }) => {
  const { handleOpen } = useMessaging();
  const { restaurant } = useAuth();
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = isDirty(settings, draft);
  const noMargin = currentNoMargin(settings, draft);
  const preview = previewMetrics(settings, draft);

  function handleStep(key: StepKey, value: number): void {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function handleDiscard(): void {
    setDraft({});
    setError(null);
  }

  // The control walks the options (the closed set, plus a stored value outside it), not the number:
  // from 12 the next is 14. A key the server did not return shows "—" and its first step lands on
  // the first option, so nothing is invented until the operator moves it.
  function renderStep(
    settingKey: StepKey,
    label: string,
    hint: string,
    valueWidth: number,
    disabled = false
  ): React.ReactNode {
    const options = stepOptions(settingKey, readNumber(settings, settingKey));
    const value = currentValue(settings, draft, settingKey);
    const index = options.findIndex(option => option.value === value);

    return (
      <SettingsRow label={label} hint={hint}>
        <Stepper
          label={label}
          value={index}
          min={0}
          max={options.length - 1}
          display={index >= 0 ? options[index].label : '—'}
          valueWidth={valueWidth}
          disabled={disabled}
          onChange={next => handleStep(settingKey, options[next].value)}
        />
      </SettingsRow>
    );
  }

  // The save is a button handler, not a submit: the appearance radios live inside this form, and
  // Enter on a focused radio submits implicitly in Chromium, which would write the restaurant's settings.
  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      // PUT /printerSettings deletes every row and recreates the payload's keys, so the payload is
      // built over the server's copy read right now, never over the session snapshot (days old, the
      // app lives in the tray). If it cannot be read, nothing is sent.
      let fresh: PrinterSettingsData | null = null;

      try {
        fresh = await fetchPrinterSettings();
      } catch (err: unknown) {
        log.error('printer settings read before save failed', err);
      }

      if (!fresh) {
        setError('Não foi possível confirmar as configurações atuais. Nada foi salvo; tente de novo.');
        return;
      }

      const saved = await updatePrinterSettings(fresh, diffChanges(fresh, draft));

      onSaved(saved);
      setDraft({});
      handleOpen('Configurações de impressão salvas.');
    } catch (err: unknown) {
      // The draft stays on screen in every failure: the operator keeps what they set.
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

  const restaurantName = (restaurant?.name || 'Restaurante').toUpperCase();

  return (
    <form className={styles.grid} onSubmit={event => event.preventDefault()}>
      <div className={styles.column}>
        <section className={styles.card} aria-labelledby="copies-title">
          <h2 className={styles.cardTitle} id="copies-title">
            Cópias
          </h2>
          {renderStep(
            'production_template_copies',
            'Comprovante de produção',
            'Sai na impressora do setor quando o pedido entra',
            40
          )}
          {renderStep('shipment_template_copies', 'Comprovante de expedição', 'Sai quando o pedido é despachado', 40)}
        </section>
        <section className={styles.card} aria-labelledby="layout-title">
          <h2 className={styles.cardTitle} id="layout-title">
            Layout do comprovante
          </h2>
          {renderStep('font_size', 'Tamanho da fonte', 'Em pixels', 64)}
          {renderStep('margin_size', 'Margem', marginHint(noMargin), 64, noMargin)}
          <SettingsRow label="Sem margem" hint="Usa toda a largura da bobina" last>
            <Switch
              label="Sem margem"
              checked={noMargin}
              onChange={next => setDraft(current => ({ ...current, no_margin: next }))}
            />
          </SettingsRow>
        </section>
        <p className={styles.note}>
          Estas configurações são do restaurante e valem também no painel administrativo. Quem aplica no comprovante é o
          servidor.
        </p>
        {children}
      </div>
      <aside className={styles.preview} aria-label="Pré-visualização">
        <div className={styles.previewLabel}>Pré-visualização</div>
        <div className={styles.stage}>
          <div
            className={styles.paper}
            data-testid="preview-paper"
            style={{ width: preview.width, fontSize: preview.fontSize, padding: preview.padding }}
          >
            <div className={styles.paperTitle}>{restaurantName}</div>
            <div className={styles.paperCenter}>PEDIDO #0142 · 15:41</div>
            <div className={styles.paperRule} />
            <div>1x Pizza Margherita G</div>
            <div className={styles.paperSub}>+ borda catupiry</div>
            <div>2x Guaraná lata</div>
            <div className={styles.paperRule} />
            <div className={styles.paperTotal}>
              <span>TOTAL</span>
              <span>R$ 78,90</span>
            </div>
          </div>
        </div>
      </aside>
      {dirty && (
        <div className={styles.bar} role="region" aria-label="Alterações não salvas">
          <div className={styles.barText}>
            <span>Alterações não salvas</span>
            {error && (
              <span role="alert" className={styles.barError}>
                {error}
              </span>
            )}
          </div>
          <Button variant="text" size={34} disabled={saving} onClick={handleDiscard}>
            Descartar
          </Button>
          <Button variant="contained" size={34} disabled={saving} onClick={handleSave}>
            Salvar
          </Button>
        </div>
      )}
    </form>
  );
};

export default PrinterSettingsForm;
