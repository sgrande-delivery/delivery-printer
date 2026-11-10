import React from 'react';
import Spinner from 'renderer/base/Spinner';
import styles from './InsideSaving.module.css';

const InsideSaving: React.FC = () => (
  <div className={styles.loading}>
    <Spinner />
  </div>
);

export default InsideSaving;
