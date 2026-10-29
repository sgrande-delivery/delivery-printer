import React from 'react';
import Icon from './Icon';
import { cx } from './cx';
import styles from './Stepper.module.css';

interface StepperProps {
  /** Names the control for assistive tech: "Cópias" becomes "Diminuir Cópias" / "Aumentar Cópias". */
  label: string;
  value: number;
  onChange(next: number): void;
  min: number;
  max: number;
  step?: number;
  /** What the middle shows when it is not the bare number (a unit, a "0px" for the 1 the API stores). */
  display?: string;
  /** Pixels of the middle cell: 36 in the drawer, 40 for the copies, 64 for the layout rows (printer-v2.dc.html). */
  valueWidth?: number;
  disabled?: boolean;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Minus / value / plus, the 34 px control of the design. A value already outside the range can still be walked back into it. */
const Stepper: React.FC<StepperProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  display,
  valueWidth = 36,
  disabled = false,
  className,
}) => {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  function decrease(): void {
    if (canDecrease) {
      onChange(clamp(value - step, min, max));
    }
  }

  function increase(): void {
    if (canIncrease) {
      onChange(clamp(value + step, min, max));
    }
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      decrease();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      increase();
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cx(styles.root, disabled && styles.disabled, className)}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className={styles.button}
        aria-label={`Diminuir ${label}`}
        disabled={!canDecrease}
        onClick={decrease}
      >
        <Icon name="remove" size={18} />
      </button>
      <span className={styles.value} style={{ width: valueWidth }} aria-live="polite">
        {display ?? value}
      </span>
      <button
        type="button"
        className={styles.button}
        aria-label={`Aumentar ${label}`}
        disabled={!canIncrease}
        onClick={increase}
      >
        <Icon name="add" size={18} />
      </button>
    </div>
  );
};

export default Stepper;
