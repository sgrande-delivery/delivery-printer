import React, { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => (
  <div className={styles.container}>
    <div id="content-wrapper" className={styles.contentWrapper}>
      <div id="app-content" className={styles.content}>
        {children}
      </div>
    </div>
  </div>
);

export default AuthLayout;
