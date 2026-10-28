import React, { ReactNode } from 'react';
import symbol from 'renderer/images/brand/simbolo.png';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.png';
import { useTheme } from 'renderer/providers/theme';
import styles from './StateLayout.module.css';

interface StateLayoutProps {
  children: ReactNode;
}

// The frame of the loading and no-connection screens (printer-v2.dc.html:470-476). They cannot render
// inside the AppShell, which needs a session and a restaurant that those screens exist to wait for.
const StateLayout: React.FC<StateLayoutProps> = ({ children }) => {
  const { resolved } = useTheme();

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <img className={styles.symbol} src={resolved === 'dark' ? symbolNegative : symbol} alt="SGrande" />
        <span className={styles.name}>SGrande Delivery Printer</span>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
};

export default StateLayout;
