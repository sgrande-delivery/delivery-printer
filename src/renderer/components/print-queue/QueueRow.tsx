import React from 'react';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import type { QueueRow as QueueRowData } from './queueView';
import styles from './QueueRow.module.css';

interface QueueRowProps {
  row: QueueRowData;
  onDiscard(id: string, title: string): void;
  onRetry(id: string, title: string): void;
}

const QueueRow: React.FC<QueueRowProps> = ({ row, onDiscard, onRetry }) => (
  <div className={cx(styles.grid, styles.row)} role="row">
    <div className={styles.job} role="cell">
      <Icon name={row.kindIcon} size={20} className={styles.kindIcon} />
      <div className={styles.jobText}>
        <div className={styles.title}>{row.title}</div>
        <div className={styles.subtitle}>{row.subtitle}</div>
      </div>
    </div>
    <span className={styles.printer} role="cell">
      {row.printer}
    </span>
    <span className={styles.attempts} role="cell">
      {row.attempts}
    </span>
    <span className={cx(styles.situation, row.situation.tone === 'err' && styles.situationErr)} role="cell">
      <Icon name={row.situation.icon} size={16} />
      {row.situation.text}
    </span>
    <div className={styles.actions} role="cell">
      {row.failed && (
        <>
          <Button size="row" aria-label={`Descartar ${row.title}`} onClick={() => onDiscard(row.id, row.title)}>
            Descartar
          </Button>
          <Button
            size="row"
            variant="contained"
            aria-label={`Tentar de novo ${row.title}`}
            onClick={() => onRetry(row.id, row.title)}
          >
            Tentar de novo
          </Button>
        </>
      )}
    </div>
  </div>
);

export default QueueRow;
