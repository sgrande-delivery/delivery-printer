import React from 'react';
import { cx } from './cx';
import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  /** The accessible name. The visible label lives next to the switch, in the screen. */
  label: string;
  disabled?: boolean;
  className?: string;
}

/** The 40 x 22 toggle of the design (printer-v2.dc.html:427): accent track when on, the line color when off. */
const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled = false, className }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className={cx(styles.root, checked && styles.on, className)}
    onClick={() => onChange(!checked)}
  >
    <span className={cx(styles.knob, checked && styles.knobOn)} />
  </button>
);

export default Switch;
