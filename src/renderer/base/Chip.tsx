import React, { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Chip.module.css';

interface ChipProps {
  /** `neutral` is the bordered surface pill; `ok` and `err` are the soft-filled status pills. */
  tone?: 'neutral' | 'ok' | 'err';
  /** The three heights of the design: 26 (header status), 32 (back chip, icon first), 34 (printer). */
  size?: 'small' | 'medium' | 'large';
  /** The leading dot. Omit it for no dot; `muted` is "not measured". */
  dot?: 'ok' | 'err' | 'muted';
  /** With a handler the chip is a <button>; without, a <span>. */
  onClick?(): void;
  className?: string;
  children: ReactNode;
}

const Chip: React.FC<ChipProps> = ({ tone = 'neutral', size = 'large', dot, onClick, className, children }) => {
  const classes = cx(
    styles.root,
    size === 'small' && styles.small,
    size === 'medium' && styles.medium,
    size === 'large' && styles.large,
    tone === 'neutral' && styles.neutral,
    tone === 'ok' && styles.ok,
    tone === 'err' && styles.err,
    onClick && styles.clickable,
    className
  );
  const dotNode = dot && (
    <span
      className={cx(
        styles.dot,
        dot === 'ok' && styles.dotOk,
        dot === 'err' && styles.dotErr,
        dot === 'muted' && styles.dotMuted
      )}
    />
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {dotNode}
        {children}
      </button>
    );
  }

  return (
    <span className={classes}>
      {dotNode}
      {children}
    </span>
  );
};

export default Chip;
