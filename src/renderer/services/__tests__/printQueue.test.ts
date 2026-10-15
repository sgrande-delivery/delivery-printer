import { describe, expect, it, vi } from 'vitest';
import { enqueueReceipts } from '../printQueue';

describe('enqueueReceipts', () => {
  it('sends the whole response in one call, one item per entry, even with the same device_name', async () => {
    vi.mocked(window.electron.enqueue).mockResolvedValue('enqueued');

    await enqueueReceipts(
      [
        { content: '<p>1</p>', copies: 1, device_name: 'Cozinha' },
        { content: '<p>2</p>', copies: 2, device_name: 'Cozinha' },
      ],
      { kind: 'order-created', source: 'event', orderUuid: 'u-1', label: 'o pedido #1' }
    );

    expect(window.electron.enqueue).toHaveBeenCalledTimes(1);
    const { items } = vi.mocked(window.electron.enqueue).mock.calls[0][0];
    expect(items.map(item => item.payload.content)).toEqual(['<p>1</p>', '<p>2</p>']);
    expect(items[0].id).not.toBe(items[1].id);
    items.forEach(item => expect(item.id).toBe(item.payload.id));
  });
});
