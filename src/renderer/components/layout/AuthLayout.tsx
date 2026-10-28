import React, { ReactNode } from 'react';
import BrandPanel from 'renderer/components/login/BrandPanel';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  children: ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => (
  <div className={styles.container}>
    <BrandPanel />
    <main className={styles.content}>{children}</main>
  </div>
);

export default AuthLayout;
