import React from 'react';
import type { PrintJobSummary } from 'shared/printQueue';
import FailedJobItem from './FailedJobItem';
import styles from './FailedJobList.module.css';

interface FailedJobListProps {
  jobs: PrintJobSummary[];
  onRetry(id: string): void;
}

const FailedJobList: React.FC<FailedJobListProps> = ({ jobs, onRetry }) => {
  return (
    <ul className={styles.failedList}>
      {jobs.map(job => (
        <FailedJobItem key={job.id} job={job} onRetry={onRetry} />
      ))}
    </ul>
  );
};

export default FailedJobList;
