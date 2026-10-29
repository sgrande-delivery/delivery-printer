import React from 'react';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import PrinterItem from './PrinterItem';
import styles from './PrinterList.module.css';

interface PrinterListProps {
  printers: ResolvedPrinter[];
  devicesRead: boolean;
  onEdit(printer: ResolvedPrinter): void;
}

const PrinterList: React.FC<PrinterListProps> = ({ printers, devicesRead, onEdit }) => {
  return (
    <ul className={styles.list}>
      {printers.map(printer => (
        <PrinterItem key={printer.id} printer={printer} devicesRead={devicesRead} onEdit={onEdit} />
      ))}
    </ul>
  );
};

export default PrinterList;
