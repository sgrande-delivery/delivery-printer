import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'contained' | 'outlined' | 'text';
  /** 34 and 38 are heights of the design (printer-v2.dc.html:266 and :431), 44 the test page action (:359), named by the number so they cannot be mistaken for a screen. */
  size?: 'medium' | 'small' | 'large' | 'action' | 'hero' | 'row' | 34 | 38 | 44;
  fullWidth?: boolean;
  children?: ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'text',
  size = 'medium',
  fullWidth = false,
  type = 'button',
  className,
  children,
  ...rest
}) => (
  <button
    type={type}
    className={cx(
      styles.root,
      variant === 'contained' && styles.containedPrimary,
      variant === 'outlined' && styles.outlined,
      variant === 'text' && styles.text,
      size === 'small' && styles.small,
      size === 'large' && styles.large,
      size === 'action' && styles.action,
      size === 'hero' && styles.hero,
      size === 'row' && styles.row,
      size === 34 && styles.h34,
      size === 38 && styles.h38,
      size === 44 && styles.h44,
      fullWidth && styles.fullWidth,
      className
    )}
    {...rest}
  >
    {children}
  </button>
);

export default Button;
