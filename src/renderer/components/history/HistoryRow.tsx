import React from 'react';
import Chip from 'renderer/base/Chip';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import { unavailableReprintHint } from './historyView';
import type { HistoryRow as HistoryRowData } from './historyView';
import styles from './HistoryRow.module.css';

interface HistoryRowProps {
  row: HistoryRowData;
  onReprint(row: HistoryRowData): void;
}

// printer-v2.dc.html:238-251. The button only exists where the main still holds the receipt HTML: a
// button that prints a blank page is worse than none (spec 38, RN-09).
const HistoryRow: React.FC<HistoryRowProps> = ({ row, onReprint }) => (
  <div className={cx(styles.grid, styles.row)} role="row">
    <span className={styles.time} role="cell">
      {row.time}
    </span>
    <span className={styles.order} role="cell">
      {row.title}
    </span>
    <span className={styles.kind} role="cell">
      <Icon name={row.kindIcon} size={16} />
      {row.kindLabel}
    </span>
    <span className={styles.printer} role="cell">
      {row.printer}
    </span>
    <span className={styles.copies} role="cell">
      {row.copies}
    </span>
    <span className={styles.situation} role="cell">
      <Chip size="compact" tone={row.failed ? 'err' : 'ok'}>
        {row.situation}
      </Chip>
    </span>
    <span className={styles.action} role="cell">
      {row.reprintable ? (
        <button
          type="button"
          className={styles.reprint}
          title="Reimprimir"
          aria-label={`Reimprimir ${row.title}`}
          onClick={() => onReprint(row)}
        >
          <Icon name="print" size={18} />
        </button>
      ) : (
        <span className={styles.unavailable} title={unavailableReprintHint()} />
      )}
    </span>
  </div>
);

export default HistoryRow;
