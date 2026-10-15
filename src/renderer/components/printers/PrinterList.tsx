import React from 'react';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import type { WindowsPrinter } from 'shared/windowsPrinter';
import PrinterItem from './PrinterItem';
import styles from './PrinterList.module.css';

interface PrinterListProps {
  printers: ResolvedPrinter[];
  devices: WindowsPrinter[];
  devicesRead: boolean;
  onChanged(): void;
}

const PrinterList: React.FC<PrinterListProps> = ({ printers, devices, devicesRead, onChanged }) => {
  return (
    <ul className={styles.list}>
      {printers.map(printer => (
        <PrinterItem
          key={printer.id}
          printer={printer}
          devices={devices}
          devicesRead={devicesRead}
          onChanged={onChanged}
        />
      ))}
    </ul>
  );
};

export default PrinterList;
