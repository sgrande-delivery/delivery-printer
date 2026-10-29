import React, { useEffect, useRef } from 'react';
import { usePrinterSettings } from 'renderer/hooks/usePrinterSettings';
import { useMessaging } from 'renderer/providers/messaging';
import { hasKnownSettings } from 'renderer/services/printerSettings';
import { log } from 'renderer/services/log';
import PrintersNotice from 'renderer/components/printers/PrintersNotice';
import AppearanceSection from './AppearanceSection';
import PrinterSettingsForm from './PrinterSettingsForm';
import styles from './PrinterSettings.module.css';

// printer-v2.dc.html:285-343. The shell gives the title, the padding and the drag region.
const PrinterSettings: React.FC = () => {
  const { settings, adopt, revalidate } = usePrinterSettings();
  const { handleOpen } = useMessaging();
  // handleOpen changes identity whenever the snackbar opens: as a dependency it would re-run the read
  // after every failure message, forever.
  const handleOpenRef = useRef(handleOpen);

  useEffect(() => {
    handleOpenRef.current = handleOpen;
  }, [handleOpen]);

  // The baseline is the session copy from login, and saving rewrites every row from it. Opening the
  // screen reads the server's copy again, or a save would undo what the admin panel changed since.
  useEffect(() => {
    revalidate().catch((err: unknown) => {
      log.error('printer settings revalidate failed', err);
      handleOpenRef.current(
        'Não foi possível conferir as configurações no servidor. Mostrando as do início da sessão.'
      );
    });
  }, [revalidate]);

  if (!hasKnownSettings(settings)) {
    return (
      <div className={styles.fallback}>
        <PrintersNotice
          title="Não foi possível ler as configurações de impressão"
          text="As configurações deste restaurante não vieram completas, e salvar agora poderia apagar as que já existem. Nada foi alterado. Feche e abra o aplicativo; se continuar, avise o suporte."
        />
        <AppearanceSection />
      </div>
    );
  }

  return (
    <PrinterSettingsForm settings={settings} onSaved={adopt}>
      <AppearanceSection />
    </PrinterSettingsForm>
  );
};

export default PrinterSettings;
