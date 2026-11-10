import React, { InputHTMLAttributes, ReactNode, useId } from 'react';
import { cx } from './cx';
import styles from './TextField.module.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  fullWidth?: boolean;
  endAdornment?: ReactNode;
  /** 'floating' is the MUI-style label that floats; 'boxed' is the label above a bordered box (login). */
  variant?: 'floating' | 'boxed';
}

const TextField: React.FC<TextFieldProps> = ({
  label,
  fullWidth = false,
  endAdornment,
  className,
  placeholder,
  variant = 'floating',
  ...rest
}) => {
  const id = useId();

  if (variant === 'boxed') {
    return (
      <div className={cx(styles.boxedRoot, fullWidth && styles.fullWidth, className)}>
        <label htmlFor={id} className={styles.boxedLabel}>
          {label}
        </label>
        <div className={styles.box}>
          <input id={id} className={styles.boxedInput} placeholder={placeholder} {...rest} />
          {endAdornment}
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.root, fullWidth && styles.fullWidth, className)}>
      <div className={styles.inputWrapper}>
        {/* The input comes before the label so the label can react to :focus
            and :placeholder-shown through the sibling selector. */}
        <input id={id} className={styles.input} placeholder={placeholder ?? ' '} {...rest} />
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {endAdornment && <span className={styles.adornment}>{endAdornment}</span>}
      </div>
    </div>
  );
};

export default TextField;
