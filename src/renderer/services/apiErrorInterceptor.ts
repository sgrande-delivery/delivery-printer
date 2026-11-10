import { AxiosError } from 'axios';
import { describeError } from 'shared/describeError';
import { refreshTokenRequest } from './refreshTokenRequest';
import { api } from './api';
import { history } from './history';
import { log } from './log';

type ApiResponseError = {
  code: string;
  message: string;
  statusCode: number;
};

type Queue = {
  onSuccess: () => Promise<void>;
};

let isRefresing = false;
let queue: Queue[] = [];

export async function apiErrorInterceptor(error: AxiosError<ApiResponseError>) {
  const config = error.config;

  if (error.response?.status !== 401) {
    return Promise.reject(error);
  }

  if (error.response?.data?.code === 'login.invalid_credentials') {
    return Promise.reject(error);
  }

  if (error.response?.data?.code !== 'access_token.expired') {
    log.warn('session refused, sending to login', { error: describeError(error) });
    history.push('/login');
    return Promise.reject(error);
  }

  if (!config) {
    return Promise.reject(error);
  }

  if (!isRefresing) {
    isRefresing = true;

    try {
      await refreshTokenRequest();
    } catch (err) {
      log.error('token refresh failed, sending to login', err);
      history.push('/login');
      return Promise.reject(err);
    } finally {
      isRefresing = false;
    }

    const response = api({ ...config, headers: { ...config.headers } });

    Promise.all(queue.map(item => item.onSuccess())).then(() => {
      queue = [];
    });

    return response;
  }

  return new Promise(resolve => {
    queue.push({
      onSuccess: async () => resolve(await api({ ...config, headers: { ...config.headers } })), // bug, it is required destructuring
    });
  });
}
