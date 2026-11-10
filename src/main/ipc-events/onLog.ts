import { IpcMainEvent } from 'electron';
import { logger } from '../logger';

const LEVELS = ['error', 'warn', 'info'] as const;

export type RendererLogLevel = (typeof LEVELS)[number];

function isLevel(value: unknown): value is RendererLogLevel {
  return LEVELS.some(level => level === value);
}

// Fire-and-forget (ipcMain.on): a log call must never hand a rejected promise to
// the renderer. The renderer already describes errors field by field, so
// `context` is only serialized here, never inspected.
export function onLog(_event: IpcMainEvent, level: unknown, message: unknown, context?: unknown): void {
  const scoped = logger.scope('renderer');
  const text = typeof message === 'string' ? message : 'invalid log message';
  const suffix = context === undefined ? '' : ` ${serialize(context)}`;

  scoped[isLevel(level) ? level : 'info'](`${text}${suffix}`);
}

function serialize(context: unknown): string {
  try {
    return JSON.stringify(context) ?? '';
  } catch {
    return '[unserializable context]';
  }
}
