// The tab the queue screen opens on; the dashboard passes it through the navigate state.
export type QueueTab = 'pending' | 'failed';

export function isQueueTab(value: unknown): value is QueueTab {
  return value === 'pending' || value === 'failed';
}
