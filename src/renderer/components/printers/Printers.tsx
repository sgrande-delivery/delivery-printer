import React, { useEffect, useState } from 'react';
import Icon from 'renderer/base/Icon';
import { usePrinters } from 'renderer/hooks/usePrinters';
import { useMessaging } from 'renderer/providers/messaging';
import PrinterDrawer from './PrinterDrawer';
import PrinterList from './PrinterList';
import PrintersNotice from './PrintersNotice';
import { printersGate } from './printersGate';
import styles from './Printers.module.css';

// printer-v2.dc.html:256-283. The shell gives the title, the padding and the drag region.
const Printers: React.FC = () => {
  const { status, printers, devices, devicesRead, refresh, reload, revalidate } = usePrinters();
  const { handleOpen } = useMessaging();
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = printers.find(printer => printer.id === editingId) ?? null;

  // The list is shared with the sidebar and was loaded when the shell opened: coming here reads it
  // again, because the operator may have changed Windows since. Not a second request on first entry.
  useEffect(() => {
    revalidate();
  }, [revalidate]);

  const gate = printersGate(status, reload);

  if (gate) {
    return gate;
  }

  return (
    <div className={styles.root}>
      {printers.length === 0 ? (
        <p className={styles.empty}>Nenhuma impressora cadastrada para este restaurante.</p>
      ) : (
        <>
          {!devicesRead && (
            <PrintersNotice
              title="Não foi possível ler as impressoras deste computador"
              text="Não dá para dizer se as impressoras cadastradas estão instaladas aqui. Confira no Windows e tente novamente."
              onRetry={reload}
            />
          )}
          <div className={styles.info}>
            <Icon name="info" size={20} />
            <div>
              O nome cadastrado precisa ser <b>igual ao da impressora no Windows</b>. Quando não é, o comprovante sai na
              impressora padrão sem aviso. Corrija escolhendo da lista desta máquina.
            </div>
          </div>
          <PrinterList printers={printers} devicesRead={devicesRead} onEdit={printer => setEditingId(printer.id)} />
        </>
      )}
      {devices.length > 0 && (
        <div>
          <div className={styles.devicesTitle}>Impressoras instaladas nesta máquina</div>
          <ul className={styles.devices}>
            {devices.map(device => (
              <li key={device.name} className={styles.device}>
                <Icon name="print" size={16} />
                {device.name}
                {device.isDefault && <span className={styles.deviceDefault}>(padrão)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && (
        <PrinterDrawer
          printer={editing}
          devices={devices}
          onClose={() => setEditingId(null)}
          onChanged={refresh}
          onSaved={() => {
            setEditingId(null);
            handleOpen('Impressora salva. O próximo comprovante já usa este cadastro.');
            refresh();
          }}
        />
      )}
    </div>
  );
};

export default Printers;
