import { app, BrowserWindow, Event, ipcMain } from 'electron';
import { describeError } from 'shared/describeError';
import { EVENT_CHANNELS, SEND_CHANNELS } from 'shared/ipcChannels';
import { logger } from '../logger';

export const BEFORE_QUIT_CHANNEL = EVENT_CHANNELS.beforeQuit;
export const BEFORE_QUIT_DONE_CHANNEL = SEND_CHANNELS.beforeQuitDone;
export const QUIT_TIMEOUT_MS = 300;

let quitting = false;

// The socket that the server trusts lives in the renderer, so the renderer is
// the one that emits `printer_exited`. Quit waits for its ack, but never longer
// than the timeout: a closed window or a dead socket must not hold the app open.
export function onBeforeQuit(event: Event, window: BrowserWindow): void {
  if (quitting) {
    return;
  }

  quitting = true;
  event.preventDefault();

  let finished = false;

  const finish = (): void => {
    if (finished) {
      return;
    }

    finished = true;
    clearTimeout(timer);
    ipcMain.removeListener(BEFORE_QUIT_DONE_CHANNEL, finish);
    app.quit();
  };

  const timer = setTimeout(finish, QUIT_TIMEOUT_MS);
  ipcMain.once(BEFORE_QUIT_DONE_CHANNEL, finish);

  try {
    if (!window.isDestroyed()) {
      window.webContents.send(BEFORE_QUIT_CHANNEL);
    }
  } catch (err) {
    logger.error('before-quit: could not notify the renderer', describeError(err));
  }
}
