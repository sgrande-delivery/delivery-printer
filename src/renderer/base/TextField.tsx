import React, { InputHTMLAttributes, ReactNode, useId } from 'react';
import { cx } from './cx';
import styles from './TextField.module.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  fullWidth?: boolean;
  endAdornment?: ReactNode;
}

const TextField: React.FC<TextFieldProps> = ({
  label,
  fullWidth = false,
  endAdornment,
  className,
  placeholder = ' ',
  ...rest
}) => {
  const id = useId();

  return (
    <div className={cx(styles.root, fullWidth && styles.fullWidth, className)}>
      <div className={styles.inputWrapper}>
        {/* The input comes before the label so the label can react to :focus
            and :placeholder-shown through the sibling selector. */}
        <input id={id} className={styles.input} placeholder={placeholder} {...rest} />
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        {endAdornment && <span className={styles.adornment}>{endAdornment}</span>}
      </div>
    </div>
  );
};

export default TextField;
