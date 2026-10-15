import React from 'react';
import Typography from 'renderer/base/Typography';
import { usePrinterSettings } from 'renderer/hooks/usePrinterSettings';
import { history } from 'renderer/services/history';
import { hasKnownSettings } from 'renderer/services/printerSettings';
import PrintersNotice from 'renderer/components/printers/PrintersNotice';
import PrinterSettingsForm from './PrinterSettingsForm';
import styles from './PrinterSettings.module.css';

const PrinterSettings: React.FC = () => {
  const { settings, adopt } = usePrinterSettings();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Typography variant="h4">Configurações de impressão</Typography>
        <button type="button" className={styles.linkBack} onClick={() => history.push('/')}>
          voltar
        </button>
      </div>
      {hasKnownSettings(settings) ? (
        <PrinterSettingsForm settings={settings} onSaved={adopt} />
      ) : (
        <PrintersNotice
          title="Não foi possível ler as configurações de impressão"
          text="As configurações deste restaurante não vieram completas, e salvar agora poderia apagar as que já existem. Nada foi alterado. Feche e abra o aplicativo; se continuar, avise o suporte."
        />
      )}
    </div>
  );
};

export default PrinterSettings;
