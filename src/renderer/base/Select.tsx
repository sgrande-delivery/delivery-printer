import React, { SelectHTMLAttributes, useId } from 'react';
import { cx } from './cx';
import styles from './Select.module.css';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  fullWidth?: boolean;
}

const Select: React.FC<SelectProps> = ({ label, fullWidth = false, className, children, ...rest }) => {
  const id = useId();

  return (
    <div className={cx(styles.root, fullWidth && styles.fullWidth, className)}>
      <div className={styles.selectWrapper}>
        {/* The select comes before the label, as in TextField, so the label can react to
            :focus through the sibling selector. A select always shows an option, so the
            label is always floated: there is no :placeholder-shown state to follow. */}
        <select id={id} className={styles.select} {...rest}>
          {children}
        </select>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      </div>
    </div>
  );
};

export default Select;
