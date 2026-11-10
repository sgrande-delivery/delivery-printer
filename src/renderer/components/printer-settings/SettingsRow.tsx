import React from 'react';
import { cx } from 'renderer/base/cx';
import styles from './SettingsRow.module.css';

interface SettingsRowProps {
  label: string;
  hint: string;
  // The last row of a card has no divider (printer-v2.dc.html:315).
  last?: boolean;
  // The control: a stepper or a switch.
  children: React.ReactNode;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ label, hint, last = false, children }) => (
  <div className={cx(styles.row, last && styles.last)}>
    <div className={styles.text}>
      <div>{label}</div>
      <div className={styles.hint}>{hint}</div>
    </div>
    {children}
  </div>
);

export default SettingsRow;
