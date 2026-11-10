import React from 'react';
import Spinner from 'renderer/base/Spinner';
import styles from './InsideLoading.module.css';

const InsideLoading: React.FC = () => (
  <div className={styles.container}>
    <Spinner />
    <span className={styles.message}>Conectando ao servidor…</span>
  </div>
);

export default InsideLoading;
