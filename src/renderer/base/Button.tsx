import React, { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

type Variant = 'contained' | 'outlined' | 'text';

/** The heights, in px, that the design draws; each one is a row of METRICS. 32 is the table-row action. */
export type ButtonHeight = 32 | 34 | 38 | 42 | 44 | 46 | 48;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** 'medium' and 'small' are the legacy square, uppercase button; a number is the design's button of that height. */
  size?: 'medium' | 'small' | ButtonHeight;
  fullWidth?: boolean;
  children?: ReactNode;
}

interface Metrics {
  radius: number;
  fontSize: number;
  gap?: number;
  paddingX: Record<Variant, number>;
  weight: Record<Variant, number>;
  /** Text variant in --text-2 instead of the inherited color: the quiet button beside a primary action. */
  quietText?: boolean;
  /** Outlined with no fill, because it sits on a card instead of on the page. */
  clearOutline?: boolean;
}

const uniform = (px: number): Record<Variant, number> => ({ contained: px, outlined: px, text: px });
const weights = (outlined: number = 400): Record<Variant, number> => ({ contained: 600, outlined, text: 400 });

/*
 * The design draws one button per screen and gives each its own padding and weight, so the size is the
 * height and everything that follows from it lives here, never as an override on the screen.
 * What is NOT here: the design gives the SAME 34 px button 14 px of padding on the printer card (:270)
 * and 16 px on the settings bar (:341). The table is keyed by height, so it holds only the first; the
 * bar's "Salvar" is 2 px narrower than drawn (row 14 of the fidelity table in spec 38).
 */
const METRICS: Record<ButtonHeight, Metrics> = {
  32: {
    radius: 6,
    fontSize: 13,
    paddingX: { contained: 12, outlined: 12, text: 10 },
    weight: weights(),
    quietText: true,
  },
  34: { radius: 6, fontSize: 13, paddingX: uniform(14), weight: weights(600), clearOutline: true },
  38: {
    radius: 6,
    fontSize: 13,
    paddingX: { contained: 18, outlined: 16, text: 16 },
    weight: weights(),
    quietText: true,
  },
  42: { radius: 8, fontSize: 14, paddingX: { contained: 20, outlined: 18, text: 20 }, weight: weights() },
  44: { radius: 8, fontSize: 14, gap: 8, paddingX: uniform(22), weight: weights() },
  46: { radius: 8, fontSize: 15, paddingX: uniform(16), weight: weights() },
  48: { radius: 8, fontSize: 15, paddingX: uniform(28), weight: weights() },
};

const Button: React.FC<ButtonProps> = ({
  variant = 'text',
  size = 'medium',
  fullWidth = false,
  type = 'button',
  className,
  style,
  children,
  ...rest
}) => {
  // The height travels inside the object so the style below needs no assertion: tsc does not carry
  // the ternary's narrowing of `size` into it, and `height` also accepts a string.
  const metrics = typeof size === 'number' ? { ...METRICS[size], height: size } : null;
  const sizeStyle: CSSProperties | undefined = metrics
    ? {
        height: metrics.height,
        padding: `0 ${metrics.paddingX[variant]}px`,
        borderRadius: metrics.radius,
        fontSize: metrics.fontSize,
        fontWeight: metrics.weight[variant],
        gap: metrics.gap,
      }
    : undefined;

  return (
    <button
      type={type}
      className={cx(
        styles.root,
        variant === 'contained' && styles.containedPrimary,
        variant === 'outlined' && styles.outlined,
        variant === 'text' && styles.text,
        size === 'small' && styles.small,
        metrics && styles.design,
        metrics?.quietText && variant === 'text' && styles.quiet,
        metrics?.clearOutline && variant === 'outlined' && styles.clearOutline,
        fullWidth && styles.fullWidth,
        className
      )}
      style={sizeStyle ? { ...sizeStyle, ...style } : style}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;
