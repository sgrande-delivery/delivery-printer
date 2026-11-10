import React from 'react';
import { cx } from './cx';
import styles from './Icon.module.css';

/** Same list as the icon_names of the font subset (fonts/README.md): change one, regenerate the other. */
export type IconName =
  | 'add'
  | 'arrow_back'
  | 'cancel'
  | 'check'
  | 'check_circle'
  | 'chevron_right'
  | 'close'
  | 'cloud_done'
  | 'cloud_off'
  | 'error'
  | 'history'
  | 'hourglass_top'
  | 'info'
  | 'logout'
  | 'person'
  | 'print'
  | 'progress_activity'
  | 'radio_button_checked'
  | 'radio_button_unchecked'
  | 'receipt'
  | 'receipt_long'
  | 'remove'
  | 'schedule'
  | 'search'
  | 'skillet'
  | 'space_dashboard'
  | 'stacks'
  | 'table_restaurant'
  | 'task_alt'
  | 'tune'
  | 'two_wheeler'
  | 'visibility'
  | 'visibility_off'
  | 'warning';

interface IconProps {
  name: IconName;
  /** Pixels. */
  size?: number;
  className?: string;
}

const Icon: React.FC<IconProps> = ({ name, size = 20, className }) => (
  <span className={cx(styles.root, className)} style={{ fontSize: size }} aria-hidden>
    {name}
  </span>
);

export default Icon;
