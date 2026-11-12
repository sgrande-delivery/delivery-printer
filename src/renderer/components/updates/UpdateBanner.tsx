import React from 'react';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import styles from './UpdateBanner.module.css';

interface UpdateBannerProps {
  version: string;
  onDismiss(): void;
  onRestart(): void;
}

// atualizacoes.dc.html:93-101. The AppShell decides when it shows; this only draws it.
const UpdateBanner: React.FC<UpdateBannerProps> = ({ version, onDismiss, onRestart }) => (
  <div role="status" aria-label="Aviso de atualização pronta" className={styles.root}>
    <Icon name="restart_alt" size={24} className={styles.icon} />
    <div className={styles.texts}>
      <div className={styles.title}>A versão {version} está pronta para instalar</div>
      <div className={styles.hint}>Se você não reiniciar agora, ela é instalada quando o app for fechado.</div>
    </div>
    <Button variant="text" size={34} onClick={onDismiss}>
      Depois
    </Button>
    <Button variant="contained" size={34} onClick={onRestart}>
      Reiniciar agora
    </Button>
  </div>
);

export default UpdateBanner;
