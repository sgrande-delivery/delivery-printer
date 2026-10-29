import React from 'react';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import { stationLabel } from 'renderer/components/printers/printerView';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import { isMissing } from './testPrintView';
import styles from './PrinterOption.module.css';

interface PrinterOptionProps {
  printer: ResolvedPrinter;
  selected: boolean;
  devicesRead: boolean;
  disabled: boolean;
  onPick(id: number): void;
}

const PrinterOption: React.FC<PrinterOptionProps> = ({ printer, selected, devicesRead, disabled, onPick }) => {
  return (
    <li role="none">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        className={cx(styles.option, selected && styles.optionSelected)}
        onClick={() => onPick(printer.id)}
      >
        <span className={cx(styles.radio, selected && styles.radioSelected)}>
          <Icon name={selected ? 'radio_button_checked' : 'radio_button_unchecked'} size={20} />
        </span>
        <span className={styles.name}>
          {printer.name}
          {isMissing(printer, devicesRead) && (
            <span className={styles.warning}>
              <Icon name="warning" size={14} />
              Não encontrada — sai na padrão
            </span>
          )}
        </span>
        <span className={styles.tag}>{stationLabel(printer.station)}</span>
      </button>
    </li>
  );
};

export default PrinterOption;
