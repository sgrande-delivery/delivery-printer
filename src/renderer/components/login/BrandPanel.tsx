import React from 'react';
import logo from 'renderer/images/brand/logo-horizontal-negativo.png';
import packageJson from '../../../../package.json';
import styles from './BrandPanel.module.css';

const BrandPanel: React.FC = () => (
  <aside className={styles.root}>
    <img src={logo} alt="SGrande Delivery" className={styles.logo} />
    <div className={styles.pitch}>
      <div className={styles.title}>SGrande Delivery Printer</div>
      <div className={styles.text}>Impressão automática dos pedidos, direto na cozinha, no bar e no caixa.</div>
    </div>
    <div className={styles.version}>
      v{packageJson.version} · {window.electron.arch} · SGrande Delivery
    </div>
  </aside>
);

export default BrandPanel;
