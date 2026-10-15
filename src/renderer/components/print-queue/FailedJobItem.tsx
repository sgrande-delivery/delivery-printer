import React from 'react';
import type { PrintJobSummary } from 'shared/printQueue';
import styles from './FailedJobItem.module.css';

interface FailedJobItemProps {
  job: PrintJobSummary;
  onRetry(id: string): void;
}

const FailedJobItem: React.FC<FailedJobItemProps> = ({ job, onRetry }) => {
  return (
    <li className={styles.failedItem}>
      <span>
        {job.label ?? 'um comprovante'} - {job.deviceName ?? 'impressora padrão'}
      </span>
      <button type="button" className={styles.linkRetry} onClick={() => onRetry(job.id)}>
        tentar de novo
      </button>
    </li>
  );
};

export default FailedJobItem;
