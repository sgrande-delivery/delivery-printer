import React, { MouseEvent } from 'react';
import { useAuth } from 'renderer/providers/auth';
import { useMessaging } from 'renderer/providers/messaging';
import RestaurantStatus from 'renderer/components/restaurant-status/RestaurantStatus';
import Typography from 'renderer/base/Typography';
import { cx } from 'renderer/base/cx';
import { log } from 'renderer/services/log';
import packageJson from '../../../../package.json';
import styles from './Status.module.css';

interface StatusProps {
  wsConnected: boolean;
  handleLogout(): void;
}

const Status: React.FC<StatusProps> = ({ wsConnected, handleLogout }) => {
  const { restaurant, user } = useAuth();
  const { handleOpen } = useMessaging();

  function handleRevealLogs() {
    window.electron
      .revealLogs()
      .then(found => {
        if (!found) {
          handleOpen('Ainda não há registros para exportar.');
        }
      })
      .catch((err: unknown) => {
        log.error('reveal logs failed', err);
        handleOpen('Não foi possível abrir a pasta dos registros.');
      });
  }

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    handleLogout();
  }

  return (
    <div className={styles.container}>
      <div className={styles.logoContent}>
        <img
          className={cx(styles.logo, restaurant?.is_open && styles.logoOpen)}
          src={restaurant?.image?.imageUrl}
          alt="logo do restaurante"
        />
        <div>
          <Typography variant="h4">{restaurant?.name}</Typography>
          <Typography variant="body1" color="textSecondary">
            {restaurant?.description}
          </Typography>
          <RestaurantStatus wsConnected={wsConnected} />
        </div>
      </div>
      {user.id && (
        <div className={styles.user}>
          {user.image ? (
            <img className={styles.avatar} src={user.image.imageUrl} alt="imagem do usuário" />
          ) : (
            <div className={cx(styles.avatar, styles.avatarFallback)}>{user.name.charAt(0)}</div>
          )}
          <div>
            <Typography variant="body2">{user.name}</Typography>
            <Typography variant="body2" color="textSecondary">
              {user.email}
            </Typography>

            <a className={styles.linkLogout} onClick={handleClick}>
              desconectar
            </a>
          </div>
        </div>
      )}
      <div className={styles.version}>
        <Typography variant="caption" color="textSecondary">
          v{packageJson.version} - {window.electron.arch}
        </Typography>
        <button type="button" className={styles.linkLogs} onClick={handleRevealLogs}>
          abrir logs
        </button>
      </div>
    </div>
  );
};

export default Status;
