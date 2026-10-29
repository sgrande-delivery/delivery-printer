import React from 'react';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import HistoryRow from './HistoryRow';
import type { HistoryRow as HistoryRowData } from './historyView';
import rowStyles from './HistoryRow.module.css';
import styles from './HistoryTable.module.css';

interface HistoryTableProps {
  rows: HistoryRowData[];
  emptyText: string;
  onReprint(row: HistoryRowData): void;
}

const HistoryTable: React.FC<HistoryTableProps> = ({ rows, emptyText, onReprint }) => (
  <div className={styles.table} role="table" aria-label="Histórico de hoje">
    <div className={cx(rowStyles.grid, styles.head)} role="row">
      <span role="columnheader">Hora</span>
      <span role="columnheader">Pedido</span>
      <span role="columnheader">Tipo</span>
      <span role="columnheader">Impressora</span>
      <span role="columnheader">Cópias</span>
      <span role="columnheader">Situação</span>
      <span role="columnheader" />
    </div>
    {rows.map(row => (
      <HistoryRow key={row.id} row={row} onReprint={onReprint} />
    ))}
    {rows.length === 0 && (
      <div className={styles.empty}>
        <Icon name="receipt_long" size={32} />
        {emptyText}
      </div>
    )}
  </div>
);

export default HistoryTable;
