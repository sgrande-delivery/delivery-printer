import React, { useState } from 'react';
import Button from 'renderer/base/Button';
import Chip from 'renderer/base/Chip';
import Stepper from 'renderer/base/Stepper';
import Switch from 'renderer/base/Switch';
import { printFailureReason } from 'renderer/helpers/printFailure';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { useMessaging } from 'renderer/providers/messaging';
import { log } from 'renderer/services/log';
import { USEFUL_WIDTH_MAX_MM, USEFUL_WIDTH_MIN_MM } from 'shared/printerGeometry';
import { TEST_PRINT_SCALE_TITLE } from 'shared/testPrintContent';
import { defaultUsefulWidth, measureMarks, stationLabel } from './printerView';
import styles from './UsefulWidthSection.module.css';

interface UsefulWidthSectionProps {
  printer: ResolvedPrinter;
  // Saved on this machine for printer.resolvedDevice; null is automatic.
  usefulWidthMm: number | null;
  onChange(deviceName: string, usefulWidthMm: number | null): Promise<void>;
}

// The part of the printer drawer that is about THIS computer, not the registration (spec 95, RF-07). Every
// change is saved at once, through its own channel, and is not part of the drawer's draft: the drawer's button
// says "Salvar no servidor", and this never goes to the server.
const UsefulWidthSection: React.FC<UsefulWidthSectionProps> = ({ printer, usefulWidthMm, onChange }) => {
  // Not in any dependency array: handleOpen changes identity whenever the snackbar opens.
  const { handleOpen } = useMessaging();
  // Only the page being queued blocks anything: the writes reach the main process in order and each is atomic,
  // so disabling the stepper on every step would only blink it and drop its focus.
  const [sending, setSending] = useState(false);
  // The measuring page went out: the question about the scale is on screen.
  const [asking, setAsking] = useState(false);
  const device = printer.resolvedDevice;

  if (!device) {
    return (
      <section className={styles.root} aria-labelledby="useful-width-title">
        <span id="useful-width-title" className={styles.label}>
          Largura útil nesta máquina
        </span>
        <p className={styles.hint}>
          Disponível quando a impressora do Windows deste cadastro for encontrada nesta máquina. Se acabou de escolhê-la
          acima, salve o cadastro e abra de novo.
        </p>
      </section>
    );
  }

  // Arrows, not function declarations: a hoisted declaration does not keep the narrowing of `device` above.
  const save = async (next: number | null): Promise<boolean> => {
    try {
      await onChange(device, next);

      return true;
    } catch (err: unknown) {
      log.error('save useful width failed', err);
      handleOpen('Não foi possível salvar a largura útil neste computador.');

      return false;
    }
  };

  // Queued, not printed: "enviada" is the honest word, like the test button of the card.
  const send = async (purpose: 'check' | 'measure'): Promise<void> => {
    const page = purpose === 'measure' ? 'a página de medição' : 'a página de teste';

    setSending(true);

    try {
      await window.electron.printTest({
        printerName: printer.name,
        stationLabel: stationLabel(printer.station),
        paperWidth: printer.paper_width,
        deviceName: device,
        purpose,
      });

      if (purpose === 'measure') {
        setAsking(true);
        handleOpen(`Página de medição enviada para a fila de impressão (${device}).`);
      } else {
        handleOpen(`Página de teste enviada para a fila de impressão (${device}).`);
      }
    } catch (err: unknown) {
      log.error('test print failed', err, { purpose });
      handleOpen(`Não foi possível enviar ${page}: ${printFailureReason(err)}.`);
    } finally {
      setSending(false);
    }
  };

  // Saved as read (spec 95, RN-12): the scale marks every 5 mm, so the number is a floor and never cuts.
  const answer = async (mark: number): Promise<void> => {
    if (await save(mark)) {
      setAsking(false);
      handleOpen(`Largura útil de ${mark} mm salva nesta máquina. Imprima o teste para conferir a moldura.`);
    }
  };

  const adjusted = usefulWidthMm !== null;

  return (
    <section className={styles.root} aria-labelledby="useful-width-title">
      <span id="useful-width-title" className={styles.label}>
        Largura útil nesta máquina
      </span>
      <div className={styles.row}>
        <div className={styles.rowText}>
          <div>Ajustar a largura útil</div>
          <div className={styles.hint}>
            {adjusted
              ? 'O comprovante é diagramado nesta largura, com a fonte escolhida no painel.'
              : 'Automática: o app usa a área que o driver da impressora informa.'}
          </div>
        </div>
        <Switch
          label="Ajustar a largura útil"
          checked={adjusted}
          onChange={on => void save(on ? defaultUsefulWidth(printer.paper_width) : null)}
        />
      </div>
      {adjusted && (
        <Stepper
          label="Largura útil"
          value={usefulWidthMm}
          min={USEFUL_WIDTH_MIN_MM}
          max={USEFUL_WIDTH_MAX_MM}
          display={`${usefulWidthMm} mm`}
          valueWidth={64}
          onChange={next => void save(next)}
        />
      )}
      <div className={styles.actions}>
        <Button size={34} variant="outlined" disabled={sending} onClick={() => void send('measure')}>
          Medir
        </Button>
        <Button size={34} variant="text" disabled={sending} onClick={() => void send('check')}>
          Imprimir teste
        </Button>
      </div>
      {asking && (
        <div className={styles.question} role="group" aria-labelledby="useful-width-question">
          <span id="useful-width-question" className={styles.questionText}>
            Qual o último número que saiu inteiro na escala “{TEST_PRINT_SCALE_TITLE}”?
          </span>
          <div className={styles.marks}>
            {measureMarks(printer.paper_width).map(mark => (
              <Chip key={mark} size="medium" tone="muted" onClick={() => void answer(mark)}>
                {mark}
              </Chip>
            ))}
          </div>
          <Button size={34} variant="text" onClick={() => setAsking(false)}>
            Cancelar
          </Button>
        </div>
      )}
      <p className={styles.hint}>
        Vale para todo cadastro que usa “{device}” neste computador. Fica salvo aqui, não no servidor.
      </p>
    </section>
  );
};

export default UsefulWidthSection;
