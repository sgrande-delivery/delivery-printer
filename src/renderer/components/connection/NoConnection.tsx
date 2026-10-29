import React, { useCallback, useEffect, useRef, useState } from 'react';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import constants from 'constants/constants';
import styles from './NoConnection.module.css';

// 12 s is the value of the design (printer-v2.dc.html:570). The counter is only what the operator
// reads; the interval is what decides to try again.
export const RETRY_SECONDS = 12;

interface NoConnectionProps {
  onRetry(): void;
}

const NoConnection: React.FC<NoConnectionProps> = ({ onRetry }) => {
  const [countdown, setCountdown] = useState(RETRY_SECONDS);
  const remaining = useRef(RETRY_SECONDS);
  const onRetryRef = useRef(onRetry);

  useEffect(() => {
    onRetryRef.current = onRetry;
  }, [onRetry]);

  useEffect(() => {
    const timer = setInterval(() => {
      remaining.current -= 1;

      if (remaining.current <= 0) {
        remaining.current = RETRY_SECONDS;
        onRetryRef.current();
      }

      setCountdown(remaining.current);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleClick = useCallback((): void => {
    remaining.current = RETRY_SECONDS;
    setCountdown(RETRY_SECONDS);
    onRetryRef.current();
  }, []);

  return (
    <div className={styles.container} role="alert">
      <div className={styles.badge}>
        <Icon name="cloud_off" size={36} />
      </div>
      <div className={styles.title}>Sem conexão com o servidor</div>
      <div className={styles.body}>
        Enquanto não houver conexão, nenhum pedido novo chega para impressão. Verifique a internet deste computador.
      </div>
      <div className={styles.session}>Você continua conectado à sua conta — não é preciso entrar de novo.</div>
      <code className={styles.address}>{constants.BASE_URL}</code>
      <div className={styles.actions}>
        <Button variant="contained" size={42} onClick={handleClick}>
          Tentar novamente
        </Button>
        <span className={styles.countdown}>nova tentativa em {countdown} s</span>
      </div>
    </div>
  );
};

export default NoConnection;
