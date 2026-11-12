import React from 'react';
import Button from 'renderer/base/Button';
import Icon from 'renderer/base/Icon';
import Spinner from 'renderer/base/Spinner';
import { cx } from 'renderer/base/cx';
import { useAppUpdateContext } from 'renderer/components/layout/appUpdateContext';
import { useRestartDialog } from 'renderer/components/layout/restartDialogContext';
import symbol from 'renderer/images/brand/simbolo.svg';
import symbolNegative from 'renderer/images/brand/simbolo-negativo.svg';
import { useNow } from 'renderer/hooks/useNow';
import { useTheme } from 'renderer/providers/theme';
import type { UpdateState } from 'shared/appUpdate';
import { buildUpdateCard, type UpdateAction, type UpdateTone } from './updateView';
import styles from './UpdateCard.module.css';

interface UpdateCardProps {
  state: UpdateState;
}

const DOT: Record<UpdateTone, string> = {
  ok: styles.dotOk,
  accent: styles.dotAccent,
  warn: styles.dotWarn,
  err: styles.dotErr,
  muted: styles.dotMuted,
};

// atualizacoes.dc.html:138-170, with the table of buildUpdateCard.
const UpdateCard: React.FC<UpdateCardProps> = ({ state }) => {
  const { resolved } = useTheme();
  const context = useAppUpdateContext();
  const { openRestartDialog } = useRestartDialog();
  // Only "hoje" in the last-check line reads the clock, so a minute is plenty.
  const now = useNow(() => true, 60_000);
  const view = buildUpdateCard(state, now);
  const { button } = view;

  const actions: Record<UpdateAction, () => Promise<void>> = {
    check: context.check,
    download: context.download,
    restart: () => Promise.resolve(openRestartDialog()),
    'cancel-restart': context.cancelRestart,
  };

  return (
    <section className={styles.root} aria-label="Atualização do aplicativo">
      <div className={styles.head}>
        <img className={styles.symbol} src={resolved === 'dark' ? symbolNegative : symbol} alt="" />
        <div className={styles.identity}>
          <div className={styles.name}>Delivery Printer {state.currentVersion}</div>
          <div className={styles.status}>
            {view.dot === 'spinner' ? <Spinner size={12} /> : <span className={cx(styles.dot, DOT[view.dot])} />}
            <span>{view.text}</span>
          </div>
        </div>
        {button && (
          <Button
            variant={button.variant}
            size={36}
            disabled={button.disabled}
            onClick={() => void actions[button.action]()}
          >
            {button.label}
          </Button>
        )}
      </div>
      {view.progress && (
        <div className={styles.progress}>
          <div
            role="progressbar"
            aria-label="Download da atualização"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.progress.percent}
            className={styles.track}
          >
            <div className={styles.fill} style={{ width: `${view.progress.percent}%` }} />
          </div>
          <div className={styles.progressText}>
            <span>
              {view.progress.percent}% · {view.progress.doneMb} de {view.progress.totalMb} MB
            </span>
            {view.progress.eta && <span>{view.progress.eta}</span>}
          </div>
        </div>
      )}
      {view.waiting && (
        <div className={styles.waiting}>
          <Icon name="hourglass_top" size={18} />
          <span className={styles.waitingText}>{view.waiting}</span>
        </div>
      )}
      <div className={styles.lastCheck}>{view.lastCheck}</div>
    </section>
  );
};

export default UpdateCard;
