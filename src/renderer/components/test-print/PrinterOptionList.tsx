import React from 'react';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import PrinterOption from './PrinterOption';
import styles from './PrinterOptionList.module.css';

interface PrinterOptionListProps {
  // The id of the visible label that names the group.
  labelId: string;
  printers: ResolvedPrinter[];
  selectedId: number;
  devicesRead: boolean;
  disabled: boolean;
  onPick(id: number): void;
}

const PrinterOptionList: React.FC<PrinterOptionListProps> = ({
  labelId,
  printers,
  selectedId,
  devicesRead,
  disabled,
  onPick,
}) => {
  return (
    <ul className={styles.list} role="radiogroup" aria-labelledby={labelId}>
      {printers.map(printer => (
        <PrinterOption
          key={printer.id}
          printer={printer}
          selected={printer.id === selectedId}
          devicesRead={devicesRead}
          disabled={disabled}
          onPick={onPick}
        />
      ))}
    </ul>
  );
};

export default PrinterOptionList;
