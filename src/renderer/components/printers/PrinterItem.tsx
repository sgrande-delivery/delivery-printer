import React from 'react';
import Typography from 'renderer/base/Typography';
import { cx } from 'renderer/base/cx';
import type { ResolvedPrinter } from 'renderer/hooks/usePrinters';
import styles from './PrinterItem.module.css';

// The seven values of PrinterStationEnum in the delivery-api
// (core/Printer/Domain/Enums/PrinterStationEnum.php). The raw value is the fallback, so
// an eighth station added there shows up as itself instead of blank.
const stations: Record<string, string> = {
  kitchen: 'Cozinha',
  bar: 'Bar',
  pizza: 'Pizza',
  counter: 'Balcão',
  cashier: 'Caixa',
  dessert: 'Sobremesa',
  sushi: 'Sushi',
};

interface PrinterItemProps {
  printer: ResolvedPrinter;
  // False when the list of this computer's printers came back empty: then "not found"
  // would be a claim the screen did not measure, so the item says nothing about it.
  devicesRead: boolean;
}

const PrinterItem: React.FC<PrinterItemProps> = ({ printer, devicesRead }) => {
  const missing = devicesRead && !printer.resolvedDevice;

  return (
    <li className={cx(styles.item, missing && styles.itemMissing)}>
      <div className={styles.itemHeader}>
        <Typography variant="body1">{printer.name}</Typography>
        <Typography variant="caption" color="textSecondary">
          {printer.activated ? 'ativa' : 'inativa'}
        </Typography>
      </div>
      <Typography variant="body2" color="textSecondary">
        {printer.station ? (stations[printer.station] ?? printer.station) : 'Sem setor'} · {printer.copies}{' '}
        {printer.copies === 1 ? 'cópia' : 'cópias'} · papel de {printer.paper_width} mm
      </Typography>
      {devicesRead && printer.resolvedDevice && (
        <Typography variant="body2" className={styles.found}>
          encontrada
        </Typography>
      )}
      {missing && (
        <div role="alert">
          <Typography variant="body2" className={styles.missing}>
            não encontrada nesta máquina
          </Typography>
          <Typography variant="body2" color="textSecondary">
            a impressão está saindo na impressora padrão do Windows
          </Typography>
        </div>
      )}
    </li>
  );
};

export default PrinterItem;
