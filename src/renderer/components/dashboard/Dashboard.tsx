import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from 'renderer/base/Button';
import Chip from 'renderer/base/Chip';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import { useDashboardHealth } from 'renderer/hooks/useDashboardHealth';
import type { QueueTab } from 'renderer/types/queueTab';
import styles from './Dashboard.module.css';

// printer-v2.dc.html:156-181, variant C.
const Dashboard: React.FC = () => {
  const { health, stats, chips } = useDashboardHealth();
  const navigate = useNavigate();
  const { action } = health;

  const cells: Array<{ label: string; value: number; onClick(): void; danger?: boolean }> = [
    { label: 'Impressos hoje', value: stats.printedToday, onClick: () => navigate('/history') },
    {
      label: 'Na fila',
      value: stats.pending,
      onClick: () => navigate('/queue', { state: { tab: 'pending' satisfies QueueTab } }),
    },
    {
      label: 'Falharam',
      value: stats.failed,
      danger: stats.failed > 0,
      onClick: () => navigate('/queue', { state: { tab: 'failed' satisfies QueueTab } }),
    },
  ];

  return (
    <div className={styles.root}>
      <div
        className={cx(
          styles.badge,
          health.tone === 'ok' && styles.badgeOk,
          health.tone === 'warn' && styles.badgeWarn,
          health.tone === 'err' && styles.badgeErr
        )}
      >
        <Icon name={health.icon} size={72} />
      </div>
      <div className={styles.text} role={health.tone === 'err' ? 'alert' : undefined}>
        <div className={styles.title}>{health.title}</div>
        <div className={styles.subtitle}>{health.subtitle}</div>
      </div>
      {action && (
        <Button variant="contained" size="hero" onClick={() => navigate(action.to)}>
          {action.label}
        </Button>
      )}
      <div className={styles.stats}>
        {cells.map(cell => (
          <button key={cell.label} type="button" className={styles.cell} onClick={cell.onClick}>
            <span className={cx(styles.value, cell.danger && styles.valueDanger)}>{cell.value}</span>
            <span className={styles.label}>{cell.label}</span>
          </button>
        ))}
      </div>
      {chips.length > 0 && (
        <div className={styles.chips}>
          {chips.map(chip => (
            <Chip key={chip.id} dot={chip.dot}>
              {chip.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
