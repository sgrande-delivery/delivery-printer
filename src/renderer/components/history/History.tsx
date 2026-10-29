import React, { useState } from 'react';
import Chip from 'renderer/base/Chip';
import Icon from 'renderer/base/Icon';
import Spinner from 'renderer/base/Spinner';
import { useMidnightTick } from 'renderer/hooks/useMidnightTick';
import { usePrintQueue } from 'renderer/hooks/usePrintQueue';
import { useMessaging } from 'renderer/providers/messaging';
import HistoryTable from './HistoryTable';
import {
  HISTORY_FILTERS,
  buildHistoryRows,
  emptyText,
  filterJobs,
  reprintMessage,
  summaryText,
  todaysJobs,
} from './historyView';
import type { HistoryFilter, HistoryRow } from './historyView';
import styles from './History.module.css';

// printer-v2.dc.html:223-254. The shell gives the title, the padding and the drag region.
const History: React.FC = () => {
  const { printed, failed, loaded, reprint } = usePrintQueue();
  const { handleOpen } = useMessaging();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');

  // "Hoje" is read from the clock on each render; the tick is what makes a quiet night cross midnight.
  useMidnightTick();
  const now = new Date();
  const today = todaysJobs([...printed, ...failed], now);
  const rows = buildHistoryRows(filterJobs(today, filter, search));

  const handleReprint = async (row: HistoryRow): Promise<void> => {
    handleOpen(reprintMessage(row.title, row.printer, await reprint(row.id)));
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            value={search}
            placeholder="Buscar pedido ou mesa"
            aria-label="Buscar pedido ou mesa"
            onChange={event => setSearch(event.target.value)}
          />
        </label>
        <div className={styles.filters}>
          {HISTORY_FILTERS.map(item => (
            <Chip
              key={item.id}
              size="medium"
              tone={filter === item.id ? 'inverse' : 'muted'}
              pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Chip>
          ))}
        </div>
        <span className={styles.summary}>{summaryText(today, now)}</span>
      </div>
      {loaded ? (
        <HistoryTable
          rows={rows}
          emptyText={emptyText(filter !== 'all' || search.trim() !== '', today.length > 0)}
          onReprint={handleReprint}
        />
      ) : (
        <Spinner />
      )}
    </div>
  );
};

export default History;
