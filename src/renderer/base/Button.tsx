import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'contained' | 'outlined' | 'text';
  size?: 'medium' | 'small' | 'large' | 'action' | 'hero' | 'row';
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
      fullWidth && styles.fullWidth,
      className
    )}
    {...rest}
  >
    {children}
  </button>
);

export default Button;
