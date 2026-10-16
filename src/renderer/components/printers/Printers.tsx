import React from 'react';
import Typography from 'renderer/base/Typography';
import Spinner from 'renderer/base/Spinner';
import { usePrinters } from 'renderer/hooks/usePrinters';
import { history } from 'renderer/services/history';
import PrinterList from './PrinterList';
import PrintersNotice from './PrintersNotice';
import styles from './Printers.module.css';

const Printers: React.FC = () => {
  const { status, printers, unregistered, devices, devicesRead, refresh, reload } = usePrinters();

  const header = (
    <>
      <div className={styles.titleBar}>
        <span>sgrande delivery printer</span>
      </div>
      <div className={styles.header}>
        <Typography variant="h4">Impressoras</Typography>
        <button type="button" className={styles.linkBack} onClick={() => history.push('/')}>
          voltar
        </button>
      </div>
    </>
  );

  if (status === 'loading') {
    return (
      <div className={styles.container}>
        {header}
        <Spinner />
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className={styles.container}>
        {header}
        <PrintersNotice
          title="Sem permissão para ver as impressoras"
          text="O usuário desta sessão não tem permissão para consultar as impressoras cadastradas. Peça ao administrador do restaurante para liberar o acesso."
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.container}>
        {header}
        <PrintersNotice
          title="Não foi possível carregar as impressoras"
          text="Verifique a internet deste computador e tente novamente."
          onRetry={reload}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {header}
      {printers.length === 0 ? (
        <Typography variant="body1" color="textSecondary">
          Nenhuma impressora cadastrada para este restaurante.
        </Typography>
      ) : (
        <>
          {!devicesRead && (
            <PrintersNotice
              title="Não foi possível ler as impressoras deste computador"
              text="Não dá para dizer se as impressoras cadastradas estão instaladas aqui. Confira no Windows e tente novamente."
              onRetry={reload}
            />
          )}
          <PrinterList printers={printers} devices={devices} devicesRead={devicesRead} onChanged={refresh} />
        </>
      )}
      {unregistered.length > 0 && (
        <div className={styles.section}>
          <Typography variant="h6">Instaladas neste computador e não cadastradas</Typography>
          <ul className={styles.unregisteredList}>
            {unregistered.map(device => (
              <li key={device.name} className={styles.unregisteredItem}>
                <Typography variant="body1">{device.name}</Typography>
                {device.isDefault && (
                  <Typography variant="caption" color="textSecondary">
                    padrão do Windows
                  </Typography>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Printers;
