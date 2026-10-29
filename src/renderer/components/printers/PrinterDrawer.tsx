import React, { useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import Button from 'renderer/base/Button';
import Chip from 'renderer/base/Chip';
import Icon from 'renderer/base/Icon';
import Stepper from 'renderer/base/Stepper';
import Switch from 'renderer/base/Switch';
import TextField from 'renderer/base/TextField';
import { cx } from 'renderer/base/cx';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { apiValidationMessage } from 'renderer/services/apiMessage';
import { log } from 'renderer/services/log';
import { togglePrinterActive, updatePrinter } from 'renderer/services/printers';
import { findPrinterByDeviceName } from 'shared/printerMatch';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import {
  MAX_COPIES,
  MIN_COPIES,
  cardState,
  draftOf,
  drawerTitle,
  isDirty,
  needsToggle,
  nextStation,
  PAPER_WIDTHS,
  stationChoices,
  toPayload,
  type PrinterDraft,
} from './printerView';
import styles from './PrinterDrawer.module.css';

interface PrinterDrawerProps {
  printer: ResolvedPrinter;
  // Every device of this computer: the names the list offers. Empty when none could be read.
  devices: WindowsPrinter[];
  onClose(): void;
  // The PUT went through but the activation did not: the list is read again, the drawer stays open.
  onChanged(): void;
  onSaved(): void;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

function failureMessage(err: unknown): string {
  if (err instanceof AxiosError && err.response?.status === 403) {
    log.warn('update printer forbidden (403)');

    return 'Sem permissão para alterar as impressoras. Nada foi salvo; peça ao administrador do restaurante para liberar o acesso.';
  }

  if (err instanceof AxiosError && err.response?.status === 422) {
    log.warn('update printer rejected (422)');

    return apiValidationMessage(err) ?? 'Os dados foram recusados pelo servidor. Nada foi salvo.';
  }

  log.error('update printer failed', err);

  return 'Não foi possível salvar. Verifique a internet deste computador e tente novamente.';
}

// printer-v2.dc.html:387-436.
const PrinterDrawer: React.FC<PrinterDrawerProps> = ({ printer, devices, onClose, onChanged, onSaved }) => {
  const [original] = useState(() => draftOf(printer));
  const [draft, setDraft] = useState<PrinterDraft>(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dirty = isDirty(original, draft);
  const selectedDevice = findPrinterByDeviceName(devices, draft.name)?.name ?? null;
  const papers = PAPER_WIDTHS;
  const stationOptions = stationChoices(original.station);
  const title = drawerTitle(cardState(printer, devices.length > 0));

  function patch(change: Partial<PrinterDraft>): void {
    setDraft(current => ({ ...current, ...change }));
    setError(null);
  }

  // Leaving with edits asks first: the draft is lost for good, and one stray click on the veil is enough.
  function requestClose(): void {
    if (saving) {
      return;
    }

    if (dirty) {
      setConfirmingClose(true);
    } else {
      onClose();
    }
  }

  // The panel takes the focus on open and gives it back to the button that opened it on close.
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
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      // Esc on the question means "no, keep editing".
      if (confirmingClose) {
        setConfirmingClose(false);
      } else if (!saving) {
        if (dirty) {
          setConfirmingClose(true);
        } else {
          onClose();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmingClose, dirty, saving, onClose]);

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

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    let written = false;

    try {
      await updatePrinter(printer.id, toPayload(printer, draft));
      written = true;

      if (needsToggle(printer, draft)) {
        await togglePrinterActive(printer.id);
      }

      onSaved();
    } catch (err: unknown) {
      if (written) {
        // Not the same claim as "nothing was saved": the data is in, only the on/off switch is not.
        log.error('toggle printer failed', err);
        setError(
          err instanceof AxiosError && err.response?.status === 403
            ? 'Os dados foram salvos, mas sem permissão para ativar ou desativar a impressora.'
            : 'Os dados foram salvos, mas não foi possível ativar ou desativar a impressora. Tente novamente.'
        );
        onChanged();
      } else {
        setError(failureMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.veil} onClick={requestClose} aria-hidden />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="printer-drawer-title"
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
      >
        <div className={styles.header}>
          <h2 id="printer-drawer-title" className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Fechar" onClick={requestClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.field} role="radiogroup" aria-labelledby="printer-drawer-device">
            <span id="printer-drawer-device" className={styles.label}>
              Impressora do Windows
            </span>
            {devices.length > 0 ? (
              devices.map(device => {
                const selected = device.name === selectedDevice;

                return (
                  <button
                    key={device.name}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={cx(styles.device, selected && styles.deviceSelected)}
                    onClick={() => patch({ name: device.name })}
                  >
                    <Icon
                      name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                      size={18}
                      className={selected ? styles.radioOn : styles.radioOff}
                    />
                    <span className={styles.deviceName}>{device.name}</span>
                    {device.isDefault && <span className={styles.deviceTag}>padrão</span>}
                  </button>
                );
              })
            ) : (
              <p className={styles.hint}>
                Não foi possível ler as impressoras deste computador. Digite o nome como aparece no Windows.
              </p>
            )}
            {/* Typed by hand stays possible: a registration may point to a printer of another machine. */}
            <TextField
              variant="boxed"
              fullWidth
              label={devices.length > 0 ? 'Ou digite o nome' : 'Nome da impressora'}
              value={draft.name}
              onChange={event => patch({ name: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label} id="printer-drawer-station">
              Setor
            </span>
            <div className={styles.chips} role="group" aria-labelledby="printer-drawer-station">
              {/* An explicit way back to "no sector": the Select this drawer replaced had it as an
                  option, and clearing by pressing the selected chip again is a gesture nobody discovers. */}
              <Chip
                size="medium"
                tone={draft.station === null ? 'inverse' : 'muted'}
                pressed={draft.station === null}
                onClick={() => patch({ station: null })}
              >
                Sem setor
              </Chip>
              {stationOptions.map(option => (
                <Chip
                  key={option.value}
                  size="medium"
                  tone={draft.station === option.value ? 'inverse' : 'muted'}
                  pressed={draft.station === option.value}
                  onClick={() => patch({ station: nextStation(draft.station, option.value) })}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className={styles.pair}>
            <div className={styles.field}>
              <span className={styles.label}>Cópias</span>
              <Stepper
                label="Cópias"
                value={draft.copies}
                min={MIN_COPIES}
                max={MAX_COPIES}
                onChange={copies => patch({ copies })}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label} id="printer-drawer-paper">
                Bobina
              </span>
              <div className={styles.segmented} role="radiogroup" aria-labelledby="printer-drawer-paper">
                {papers.map(width => (
                  <button
                    key={width}
                    type="button"
                    role="radio"
                    aria-checked={draft.paperWidth === width}
                    className={cx(styles.segment, draft.paperWidth === width && styles.segmentOn)}
                    onClick={() => patch({ paperWidth: width })}
                  >
                    {width} mm
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.activeRow}>
            <div className={styles.activeText}>
              <div>Ativa</div>
              <div className={styles.hint}>Desativada, não recebe comprovantes</div>
            </div>
            <Switch label="Ativa" checked={draft.activated} onChange={activated => patch({ activated })} />
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.footer}>
          {confirmingClose ? (
            <>
              <span className={styles.confirmText} role="alert">
                Descartar as alterações?
              </span>
              <Button size={38} onClick={() => setConfirmingClose(false)}>
                Continuar editando
              </Button>
              <Button size={38} variant="contained" onClick={onClose}>
                Descartar
              </Button>
            </>
          ) : (
            <>
              <Button size={38} onClick={requestClose} disabled={saving}>
                Cancelar
              </Button>
              <Button size={38} variant="contained" onClick={handleSave} disabled={saving || draft.name.trim() === ''}>
                Salvar no servidor
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrinterDrawer;
