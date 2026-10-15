import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPrinters } from '../printers';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('renderer/services/api', () => ({ api: { get: mocks.get } }));

describe('fetchPrinters', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  // The API answers 422 to a `rows` outside [10, 20, 50, 100]; without page/rows it
  // returns every printer. Any parameter added here reopens that.
  it('asks for /printers with no parameters at all, and returns the array as is', async () => {
    const printers = [{ id: 1, name: 'Cozinha' }];
    mocks.get.mockResolvedValue({ data: printers });

    await expect(fetchPrinters()).resolves.toBe(printers);

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith('/printers');
    expect(mocks.get.mock.calls[0]).toHaveLength(1);
  });
});
