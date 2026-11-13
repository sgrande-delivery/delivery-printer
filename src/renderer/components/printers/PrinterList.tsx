import React from 'react';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import PrinterItem from './PrinterItem';
import styles from './PrinterList.module.css';

interface PrinterListProps {
  printers: ResolvedPrinter[];
  devicesRead: boolean;
  usefulWidthFor(printer: ResolvedPrinter): number | null;
  onEdit(printer: ResolvedPrinter): void;
}

const PrinterList: React.FC<PrinterListProps> = ({ printers, devicesRead, usefulWidthFor, onEdit }) => {
  return (
    <ul className={styles.list}>
      {printers.map(printer => (
        <PrinterItem
          key={printer.id}
          printer={printer}
          devicesRead={devicesRead}
          usefulWidthMm={usefulWidthFor(printer)}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
};

export default PrinterList;
