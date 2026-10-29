import React, { ReactNode } from 'react';
import { cx } from './cx';
import styles from './Chip.module.css';

interface ChipProps {
  /** `neutral` is the bordered surface pill; `muted` is the same pill in secondary text; `ok` and `err` are the soft-filled status pills; `inverse` is the selected filter (text color as background). */
  tone?: 'neutral' | 'muted' | 'ok' | 'err' | 'inverse';
  /** The heights of the design: 22 (status in a table row), 26 (header status), 32 (back chip, filter), 34 (printer). */
  size?: 'compact' | 'small' | 'medium' | 'large';
  /** An icon is the first child: the left padding shrinks to sit under it (the back chip, printer-v2.dc.html:450). */
  iconFirst?: boolean;
  /** The leading dot. Omit it for no dot; `muted` is "not measured". */
  dot?: 'ok' | 'err' | 'muted';
  /** Only for a chip that is a toggle (a filter): becomes aria-pressed on the button. */
  pressed?: boolean;
  /** With a handler the chip is a <button>; without, a <span>. */
  onClick?(): void;
  className?: string;
  children: ReactNode;
}

const Chip: React.FC<ChipProps> = ({
  tone = 'neutral',
  size = 'large',
  iconFirst,
  dot,
  pressed,
  onClick,
  className,
  children,
}) => {
  const classes = cx(
    styles.root,
    size === 'compact' && styles.compact,
    size === 'small' && styles.small,
    size === 'medium' && styles.medium,
    size === 'large' && styles.large,
    tone === 'neutral' && styles.neutral,
    tone === 'muted' && styles.muted,
    tone === 'ok' && styles.ok,
    tone === 'err' && styles.err,
    tone === 'inverse' && styles.inverse,
    iconFirst && styles.iconFirst,
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
      <button type="button" className={classes} aria-pressed={pressed} onClick={onClick}>
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
