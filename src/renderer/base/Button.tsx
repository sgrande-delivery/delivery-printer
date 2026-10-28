import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'contained' | 'text';
  size?: 'medium' | 'small' | 'large';
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
      variant === 'contained' ? styles.containedPrimary : styles.text,
      size === 'small' && styles.small,
      size === 'large' && styles.large,
      fullWidth && styles.fullWidth,
      className
    )}
    {...rest}
  >
    {children}
  </button>
);

export default Button;
