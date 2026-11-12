import React from 'react';
import Spinner from 'renderer/base/Spinner';
import symbol from 'renderer/images/brand/simbolo.svg';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.svg';
import { useTheme } from 'renderer/providers/theme';
import styles from './RestartingOverlay.module.css';

interface RestartingOverlayProps {
  version: string | null;
}

// atualizacoes.dc.html:223-229. It lives for a few hundred ms before the process dies, so nothing here may
// wait for a fetch, an animation delay or a second render: it is plain markup over props already in memory.
const RestartingOverlay: React.FC<RestartingOverlayProps> = ({ version }) => {
  const { resolved } = useTheme();

  return (
    <div role="status" aria-label="Instalando a atualização" className={styles.root}>
      <img className={styles.symbol} src={resolved === 'dark' ? symbolNegative : symbol} alt="" />
      <Spinner size={28} />
      <span className={styles.text}>
        {version === null ? 'Instalando a atualização…' : `Instalando a versão ${version}…`}
      </span>
    </div>
  );
};

export default RestartingOverlay;
