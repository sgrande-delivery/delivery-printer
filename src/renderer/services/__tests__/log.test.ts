import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { log } from '../log';

describe('renderer log helper', () => {
  const original = window.electron;

  afterEach(() => {
    window.electron = original;
    vi.mocked(window.electron.log).mockClear();
  });

  it('sends level and message through the bridge', () => {
    log.info('hello', { orderUuid: 'o1' });

    expect(window.electron.log).toHaveBeenCalledWith('info', 'hello', { orderUuid: 'o1' });
  });

  it('describes the error before sending it, so no header reaches the channel', () => {
    const config = { method: 'get', url: '/x', headers: new AxiosHeaders({ Authorization: 'Bearer secret' }) };
    const err = new AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      config,
      {},
      { status: 500, statusText: '', headers: {}, config, data: 'body' }
    );

    log.error('failed', err, { orderUuid: 'o1' });

    const sent = JSON.stringify(vi.mocked(window.electron.log).mock.calls[0]);
    expect(sent).toContain('"status":500');
    expect(sent).not.toContain('secret');
    expect(sent).not.toContain('Authorization');
  });

  it('does not throw when the channel refuses the context', () => {
    vi.mocked(window.electron.log).mockImplementationOnce(() => {
      throw new Error('An object could not be cloned.');
    });

    expect(() => log.info('hello', { notCloneable: () => undefined })).not.toThrow();
  });

  it('does not throw when the bridge is missing', () => {
    // @ts-expect-error simulating a renderer without the preload
    window.electron = undefined;
    expect(() => log.error('failed', new Error('x'))).not.toThrow();

    // @ts-expect-error a preload from before this channel existed
    window.electron = { arch: 'x64' };
    expect(() => log.info('hello')).not.toThrow();
  });
});
