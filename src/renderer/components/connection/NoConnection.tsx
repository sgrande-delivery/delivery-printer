import React from 'react';
import Typography from 'renderer/base/Typography';
import Button from 'renderer/base/Button';
import constants from 'constants/constants';
import styles from './NoConnection.module.css';

interface NoConnectionProps {
  onRetry(): void;
}

const NoConnection: React.FC<NoConnectionProps> = ({ onRetry }) => (
  <div className={styles.container} role="alert">
    <Typography variant="h6" align="center">
      Sem conexão com o servidor
    </Typography>
    <Typography variant="body1" color="textSecondary" align="center">
      Não foi possível falar com o servidor. Verifique a internet deste computador e tente novamente.
    </Typography>
    <Typography variant="caption" color="textSecondary" align="center" className={styles.address}>
      Endereço: {constants.BASE_URL}
    </Typography>
    <Button variant="contained" onClick={onRetry}>
      Tentar novamente
    </Button>
  </div>
);

export default NoConnection;
