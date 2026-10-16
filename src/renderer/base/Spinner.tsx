import React from 'react';
import { cx } from './cx';
import styles from './Spinner.module.css';

interface SpinnerProps {
  className?: string;
}

/** Replaces MUI's CircularProgress. */
const Spinner: React.FC<SpinnerProps> = ({ className }) => (
  <span role="progressbar" aria-label="carregando" className={cx(styles.root, className)} />
);

export default Spinner;
