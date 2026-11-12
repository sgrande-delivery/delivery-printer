import React from 'react';
import Switch from 'renderer/base/Switch';
import { useAppUpdateContext } from 'renderer/components/layout/appUpdateContext';
import SettingsRow from '../printer-settings/SettingsRow';
import UpdateCard from './UpdateCard';
import ReleaseNotesCard from './ReleaseNotesCard';
import { autoDownloadHint } from './updateView';
import styles from './Updates.module.css';

// atualizacoes.dc.html:135-197. The title, the padding and the drag region belong to the shell.
const Updates: React.FC = () => {
  const { state, setAutoDownload } = useAppUpdateContext();

  if (state === null) {
    // The main process has not answered yet. Plain text, not a ring: if it never answers, a ring would spin forever.
    return (
      <div className={styles.root}>
        <p className={styles.pending} role="status">
          Lendo o estado da atualização…
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <UpdateCard state={state} />
      <section className={styles.card} aria-labelledby="updates-preferences">
        <h2 className={styles.cardTitle} id="updates-preferences">
          Preferências
        </h2>
        <SettingsRow label="Baixar e atualizar automaticamente" hint={autoDownloadHint(state.autoDownload)} last>
          <Switch
            checked={state.autoDownload}
            onChange={next => void setAutoDownload(next)}
            label="Baixar e atualizar automaticamente"
          />
        </SettingsRow>
        <p className={styles.local}>Vale só neste computador. Aplica na hora.</p>
      </section>
      <ReleaseNotesCard state={state} />
    </div>
  );
};

export default Updates;
