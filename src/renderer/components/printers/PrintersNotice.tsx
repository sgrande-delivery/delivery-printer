import React from 'react';
import Typography from 'renderer/base/Typography';
import Button from 'renderer/base/Button';
import styles from './PrintersNotice.module.css';

interface PrintersNoticeProps {
  title: string;
  text: string;
  onRetry?(): void;
}

const PrintersNotice: React.FC<PrintersNoticeProps> = ({ title, text, onRetry }) => {
  return (
    <div className={styles.notice} role="alert">
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body1" color="textSecondary">
        {text}
      </Typography>
      {onRetry && (
        <Button variant="contained" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
};

export default PrintersNotice;
