import React from 'react';
import { cx } from './cx';
import styles from './Spinner.module.css';

/** The ring sizes the design draws: 40 px for a loading screen, 28 px on the restart overlay, 12 px beside a line of text. */
export type SpinnerSize = 12 | 28 | 40;

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

// The border thickness and the track color change with the size, so each size is a class here, never an
// override on the screen (.claude/rules/renderer-ui.md).
const SIZE: Record<SpinnerSize, string | undefined> = { 12: styles.inline, 28: styles.overlay, 40: undefined };

/** Replaces MUI's CircularProgress. */
const Spinner: React.FC<SpinnerProps> = ({ size = 40, className }) => (
  <span role="progressbar" aria-label="carregando" className={cx(styles.root, 'spin', SIZE[size], className)} />
);

export default Spinner;
