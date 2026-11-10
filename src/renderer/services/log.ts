import { describeError } from 'shared/describeError';

type Level = 'error' | 'warn' | 'info';

type Context = Record<string, unknown>;

// A log call must never be the thing that breaks the screen (RN-05). Two ways it
// could: the bridge may be missing (jsdom without the stub, a preload that failed
// to load), and `context` is cloned structurally by the channel, which throws
// synchronously on a value that cannot be cloned.
function send(level: Level, message: string, context?: Context): void {
  try {
    window.electron?.log?.(level, message, context);
  } catch {
    // Nowhere left to report it: the log is the thing that failed.
  }
}

export const log = {
  info: (message: string, context?: Context): void => send('info', message, context),
  warn: (message: string, context?: Context): void => send('warn', message, context),
  // `err` goes through describeError: never hand a raw AxiosError to the log,
  // it carries the session cookie and the Authorization header (RN-02).
  error: (message: string, err: unknown, context?: Context): void =>
    send('error', message, { ...context, error: describeError(err) }),
};

// Errors that no catch handled, so they reach the file instead of vanishing (RF-05).
export function installGlobalErrorLogging(): void {
  window.addEventListener('error', event => {
    log.error('uncaught window error', event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', event => {
    log.error('unhandled promise rejection', event.reason);
  });
}
