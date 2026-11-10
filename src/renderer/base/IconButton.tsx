import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './IconButton.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'small' is the 34 px square with a 6 px radius that the design puts inside fields. */
  size?: 'medium' | 'small';
  children?: ReactNode;
}

const IconButton: React.FC<IconButtonProps> = ({ size = 'medium', type = 'button', className, children, ...rest }) => (
  <button type={type} className={cx(styles.root, size === 'small' && styles.small, className)} {...rest}>
    {children}
  </button>
);

export default IconButton;
