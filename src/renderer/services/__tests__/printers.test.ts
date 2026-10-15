import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPrinters, togglePrinterActive, updatePrinter } from '../printers';

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), patch: vi.fn() }));

vi.mock('renderer/services/api', () => ({ api: { get: mocks.get, put: mocks.put, patch: mocks.patch } }));

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

describe('updatePrinter', () => {
  beforeEach(() => {
    mocks.put.mockReset().mockResolvedValue({ data: {} });
  });

  // `name` and `address` are both required by the API's UpdatePrinterRequest: a PUT
  // without the address answers 422. `activated` is not required, and that is the trap:
  // absent, the update DTO falls back to its own default (true) and the repository writes
  // it, so omitting it re-activates a printer the operator had turned off.
  it('PUTs the whole record, name, address and activated included, to /printers/:id', async () => {
    const payload = {
      name: 'EPSON TM-T20',
      address: 'Rua A, 1',
      activated: false,
      copies: 2,
      paper_width: 80 as const,
      station: null,
    };

    await updatePrinter(7, payload);

    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(mocks.put).toHaveBeenCalledWith('/printers/7', payload);
    const body = mocks.put.mock.calls[0][1];
    expect(body).toHaveProperty('name', 'EPSON TM-T20');
    expect(body).toHaveProperty('address', 'Rua A, 1');
    expect(body).toHaveProperty('activated', false);
  });
});

describe('togglePrinterActive', () => {
  it('PATCHes the dedicated toggle-active route, with no body', async () => {
    mocks.patch.mockReset().mockResolvedValue({ data: {} });

    await togglePrinterActive(7);

    expect(mocks.patch).toHaveBeenCalledWith('/printers/7/toggle-active');
  });
});
