import React from 'react';
import Spinner from 'renderer/base/Spinner';
import Typography from 'renderer/base/Typography';
import styles from './InsideLoading.module.css';

const InsideLoading: React.FC = () => (
  <div className={styles.container}>
    <Spinner />
    <Typography variant="body2" color="textSecondary" className={styles.message}>
      carregando...
    </Typography>
  </div>
);

export default InsideLoading;
