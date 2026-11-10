import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { describeError } from '../describeError';

function axiosFailure(status?: number): AxiosError {
  const config = {
    method: 'get',
    url: '/orders/abc/print-created?token=secret-in-query',
    headers: new AxiosHeaders({ Authorization: 'Bearer eyJ.secret.jwt', Cookie: 'access_token=cookie-secret' }),
  };

  const response =
    status === undefined
      ? undefined
      : {
          status,
          statusText: 'Unauthorized',
          headers: { 'set-cookie': ['refresh_token=set-cookie-secret'] },
          config,
          data: { code: 'access_token.expired', customer: 'Maria 11 99999-0000' },
        };

  return new AxiosError(
    'Request failed',
    status === undefined ? 'ERR_NETWORK' : 'ERR_BAD_REQUEST',
    config,
    {},
    response
  );
}

describe('describeError', () => {
  it('keeps method, url, status and code of an http failure', () => {
    expect(describeError(axiosFailure(401))).toMatchObject({
      method: 'GET',
      url: '/orders/abc/print-created',
      status: 401,
      code: 'ERR_BAD_REQUEST',
      reachedServer: true,
    });
  });

  it('never carries headers, credentials, query string or the response body (RN-02)', () => {
    const serialized = JSON.stringify(describeError(axiosFailure(401)));

    for (const leaked of [
      'headers',
      'Authorization',
      'Cookie',
      'Bearer',
      'cookie-secret',
      'set-cookie',
      'secret',
      'Maria',
    ]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('describes a failure without response as a network failure', () => {
    const described = describeError(axiosFailure());

    expect(described.reachedServer).toBe(false);
    expect(described.status).toBeUndefined();
    expect(described.code).toBe('ERR_NETWORK');
  });

  it('returns name and message of a plain Error', () => {
    expect(describeError(new TypeError('boom'))).toEqual({ name: 'TypeError', message: 'boom' });
  });

  it('describes values that are not errors, such as the reason string of a print failure', () => {
    expect(describeError('Printer offline')).toEqual({ name: 'NonError', message: 'Printer offline' });
    expect(describeError(undefined).name).toBe('NonError');
    expect(describeError(null).name).toBe('NonError');
  });
});
