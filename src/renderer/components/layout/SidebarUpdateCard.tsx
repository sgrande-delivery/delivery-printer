import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import { buildSidebarUpdate, type UpdateAction, type UpdateTone } from 'renderer/components/updates/updateView';
import { useAppUpdateContext } from './appUpdateContext';
import styles from './SidebarUpdateCard.module.css';

const TONE: Record<UpdateTone, string | undefined> = {
  accent: styles.toneAccent,
  warn: styles.toneWarn,
  err: styles.toneErr,
  ok: undefined,
  muted: undefined,
};

// atualizacoes.dc.html:45-66, with the sidebar column of buildSidebarUpdate.
const SidebarUpdateCard: React.FC = () => {
  const context = useAppUpdateContext();
  const navigate = useNavigate();
  const view = context.state === null ? null : buildSidebarUpdate(context.state);

  if (view === null) {
    return null;
  }

  const { button } = view;
  const actions: Record<UpdateAction, () => Promise<void>> = {
    check: context.check,
    download: context.download,
    restart: context.restart,
    'cancel-restart': context.cancelRestart,
  };

  // The region has a name of its own: the screen's card is already "Atualização do aplicativo", and on
  // /updates the two are visible at once.
  return (
    <section className={styles.root} aria-label="Resumo da atualização">
      <button type="button" className={styles.summary} onClick={() => navigate('/updates')}>
        <Icon name={view.icon} size={20} className={cx(styles.icon, TONE[view.tone])} />
        <span className={styles.texts}>
          <span className={styles.title}>{view.title}</span>
          {view.subtitle !== '' && <span className={styles.subtitle}>{view.subtitle}</span>}
        </span>
      </button>
      {view.bar && (
        <div
          role="progressbar"
          aria-label="Download da atualização"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.percent}
          className={styles.track}
        >
          <div className={styles.fill} style={{ width: `${view.percent}%` }} />
        </div>
      )}
      {button && (
        <Button
          variant={button.variant}
          size={34}
          className={styles.action}
          onClick={() => void actions[button.action]()}
        >
          {button.label}
        </Button>
      )}
    </section>
  );
};

export default SidebarUpdateCard;
