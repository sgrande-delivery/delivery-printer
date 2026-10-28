import React from 'react';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import type { QueueTab } from 'renderer/types/queueTab';
import QueueRow from './QueueRow';
import { emptyText } from './queueView';
import type { QueueRow as QueueRowData } from './queueView';
import rowStyles from './QueueRow.module.css';
import styles from './QueueTable.module.css';

interface QueueTableProps {
  tab: QueueTab;
  rows: QueueRowData[];
  onDiscard(id: string, title: string): void;
  onRetry(id: string, title: string): void;
}

const QueueTable: React.FC<QueueTableProps> = ({ tab, rows, onDiscard, onRetry }) => (
  <div className={styles.table} role="table" aria-label={tab === 'failed' ? 'Falhados' : 'Pendentes'}>
    <div className={cx(rowStyles.grid, styles.head)} role="row">
      <span role="columnheader">Trabalho</span>
      <span role="columnheader">Impressora</span>
      <span role="columnheader">Tentativas</span>
      <span role="columnheader">Situação</span>
      <span role="columnheader" />
    </div>
    {rows.map(row => (
      <QueueRow key={row.id} row={row} onDiscard={onDiscard} onRetry={onRetry} />
    ))}
    {rows.length === 0 && (
      <div className={styles.empty}>
        <Icon name="check_circle" size={32} className={styles.emptyIcon} />
        {emptyText(tab)}
      </div>
    )}
  </div>
);

export default QueueTable;
