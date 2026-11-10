import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from 'renderer/base/Icon';
import { cx } from 'renderer/base/cx';
import { useNow } from 'renderer/hooks/useNow';
import { usePrintQueue } from 'renderer/hooks/usePrintQueue';
import { useMessaging } from 'renderer/providers/messaging';
import type { QueueTab } from 'renderer/types/queueTab';
import {
  buildRows,
  discardMessage,
  failedHeadline,
  hasCountdown,
  limitHint,
  resolveTab,
  retryMessage,
} from './queueView';
import QueueTable from './QueueTable';
import styles from './PrintQueue.module.css';

// printer-v2.dc.html:183-221. The shell gives the title, the padding and the drag region.
const PrintQueue: React.FC = () => {
  const { pending, failed, retry, discard } = usePrintQueue();
  const { handleOpen } = useMessaging();
  const location = useLocation();
  const [picked, setPicked] = useState<QueueTab | null>(null);
  const tab = resolveTab(picked, (location.state as { tab?: unknown } | null)?.tab, failed.length);
  const jobs = tab === 'failed' ? failed : pending;
  const now = useNow(clock => hasCountdown(jobs, clock));
  const rows = buildRows(jobs, now);

  // Acting pins the tab: without it, discarding the last failure would flip to Pendentes
  // and the operator would never read that nothing failed.
  const handleRetry = async (id: string, title: string): Promise<void> => {
    setPicked(tab);
    await retry(id);
    handleOpen(retryMessage(title));
  };

  const handleDiscard = async (id: string, title: string): Promise<void> => {
    setPicked(tab);
    handleOpen(discardMessage(title, await discard(id)));
  };

  const tabs: Array<{ id: QueueTab; label: string; count: number }> = [
    { id: 'pending', label: 'Pendentes', count: pending.length },
    { id: 'failed', label: 'Falhados', count: failed.length },
  ];

  return (
    <div className={styles.root}>
      {failed.length > 0 && (
        <div className={styles.notice} role="alert">
          <Icon name="error" size={22} />
          <div className={styles.noticeText}>
            <b>{failedHeadline(failed.length)}</b> — não vai sair sozinho. Corrija a causa e tente de novo.
          </div>
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          {tabs.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cx(styles.tab, tab === item.id && styles.tabActive)}
              onClick={() => setPicked(item.id)}
            >
              {item.label} · {item.count}
            </button>
          ))}
        </div>
        <span className={styles.hint}>{limitHint()}</span>
      </div>
      <QueueTable tab={tab} rows={rows} onDiscard={handleDiscard} onRetry={handleRetry} />
    </div>
  );
};

export default PrintQueue;
