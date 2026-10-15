import React, { useEffect } from 'react';
import Button from 'renderer/base/Button';
import { useMessaging, Options, CallbackFunction } from 'renderer/providers/messaging';
import styles from './Messaging.module.css';

const AUTO_HIDE_DURATION = 4000;

interface MessagingProps {
  message: string;
  options: Options | null;
  action: CallbackFunction | null;
  handleAction(): void;
  open: boolean;
}

const Messaging: React.FC<MessagingProps> = ({ message, options, action, handleAction, open }) => {
  const messaging = useMessaging();

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = setTimeout(messaging.handleClose, AUTO_HIDE_DURATION);

    return () => clearTimeout(timer);
  }, [open, messaging]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.snackbar} style={options || undefined}>
      <div className={styles.content}>
        <div className={styles.messageContent}>
          <span className={styles.message}>{message}</span>
        </div>
        <Button size="small" className={styles.actionText} onClick={action ? handleAction : messaging.handleClose}>
          {action ? 'Desfazer' : 'Fechar'}
        </Button>
      </div>
    </div>
  );
};

export default Messaging;
