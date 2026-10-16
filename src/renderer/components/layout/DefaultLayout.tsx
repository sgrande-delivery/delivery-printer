import React, { ReactNode } from 'react';
import styles from './DefaultLayout.module.css';

interface DefaultLayoutProps {
  children: ReactNode;
}

const DefaultLayout: React.FC<DefaultLayoutProps> = ({ children }) => (
  <div className={styles.wrapperContainer}>
    <div id="content-wrapper" className={styles.contentWrapperLogin}>
      <div id="app-content" className={styles.content}>
        {children}
      </div>
    </div>
  </div>
);

export default DefaultLayout;
