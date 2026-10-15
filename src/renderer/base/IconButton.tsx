import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './IconButton.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: 'default' | 'primary';
  children?: ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({
  color = 'default',
  type = 'button',
  className,
  children,
  ...rest
}) => (
  <button type={type} className={cx(styles.root, color === 'primary' && styles.colorPrimary, className)} {...rest}>
    {children}
  </button>
);

export default IconButton;
