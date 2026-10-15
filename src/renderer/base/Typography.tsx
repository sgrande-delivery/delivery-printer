import React, { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Typography.module.css';

type Variant = 'h4' | 'h6' | 'body1' | 'body2' | 'caption';
type Color = 'inherit' | 'primary' | 'textPrimary' | 'textSecondary';
type Align = 'left' | 'center' | 'right';

const elementFor: Record<Variant, ElementType> = {
  h4: 'h4',
  h6: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
};

const colorClass: Record<Color, string> = {
  inherit: styles.colorInherit,
  primary: styles.colorPrimary,
  textPrimary: styles.colorTextPrimary,
  textSecondary: styles.colorTextSecondary,
};

const alignClass: Record<Align, string> = {
  left: styles.alignLeft,
  center: styles.alignCenter,
  right: styles.alignRight,
};

interface TypographyProps extends HTMLAttributes<HTMLElement> {
  variant?: Variant;
  color?: Color;
  align?: Align;
  as?: ElementType;
  children?: ReactNode;
}

const Typography: React.FC<TypographyProps> = ({
  variant = 'body1',
  color = 'textPrimary',
  align,
  as,
  className,
  children,
  ...rest
}) => {
  const Component = as ?? elementFor[variant];

  return (
    <Component
      className={cx(styles.root, styles[variant], colorClass[color], align && alignClass[align], className)}
      {...rest}
    >
      {children}
    </Component>
  );
};

export default Typography;
