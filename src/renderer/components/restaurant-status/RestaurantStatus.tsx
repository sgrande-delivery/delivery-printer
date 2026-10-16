import React from 'react';
import { MdFiberManualRecord } from 'react-icons/md';
import Typography from 'renderer/base/Typography';
import { useAuth } from 'renderer/providers/auth';
import { cx } from 'renderer/base/cx';
import styles from './RestaurantStatus.module.css';

interface RestaurantStatusProps {
  wsConnected: boolean;
}

const RestaurantStatus: React.FC<RestaurantStatusProps> = ({ wsConnected }) => {
  const { restaurant } = useAuth();

  return (
    <div className={styles.statusContainer}>
      <Typography color="inherit" className={cx(styles.status, restaurant?.is_open && styles.open)}>
        <MdFiberManualRecord />
        {wsConnected ? (restaurant?.is_open ? 'online' : 'offline') : 'conectando...'}
      </Typography>
    </div>
  );
};

export default RestaurantStatus;
